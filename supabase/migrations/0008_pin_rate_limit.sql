-- =============================================================================
-- HACCP SaaS — 0008_pin_rate_limit
--
-- 4-miestny PIN má 10 000 kombinácií — bez obmedzenia sa dá uhádnuť hrubou
-- silou za minúty. Serverless prostredie nemá zdieľanú pamäť, takže počítadlo
-- musí byť v DB.
--
-- Dve nezávislé hranice:
--   per zamestnanec (5 / 15 min) — bráni hádaniu konkrétneho PIN-u,
--   per kiosk       (20 / 15 min) — bráni prechádzaniu všetkých zamestnancov
--                                   na jednom tablete.
--
-- Okno je klzavé: po vypršaní najstaršieho pokusu sa prístup sám odomkne,
-- takže zablokovaný kuchár nečaká na zásah admina dlhšie, než je nutné.
-- =============================================================================

create table public.pin_attempts (
  id              bigint generated always as identity primary key,
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  membership_id   uuid references public.memberships(id) on delete cascade,
  kiosk_device_id uuid references public.kiosk_devices(id) on delete cascade,
  succeeded       boolean not null,
  attempted_at    timestamptz not null default now()
);

create index pin_attempts_membership on public.pin_attempts(membership_id, attempted_at desc);
create index pin_attempts_kiosk      on public.pin_attempts(kiosk_device_id, attempted_at desc);

-- Prevádzkové dáta, nie governed tabuľka — zámerne bez audit triggera,
-- inak by každý pokus o PIN zaplavil audit_log.
alter table public.pin_attempts enable row level security;
-- Žiadna policy = žiadny prístup pre anon/authenticated. Zapisuje iba
-- service role z kiosk server actions.

revoke all on public.pin_attempts from anon, authenticated;

create or replace function public.pin_locked_seconds(
  p_membership uuid,
  p_kiosk uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window       interval := interval '15 minutes';
  v_member_max   int := 5;
  v_kiosk_max    int := 20;
  v_last_success timestamptz;
  v_fails        int;
  v_oldest       timestamptz;
begin
  -- Úspešné zadanie vynuluje sériu neúspechov.
  select max(attempted_at) into v_last_success
    from public.pin_attempts
   where membership_id = p_membership
     and succeeded;

  select count(*), min(attempted_at)
    into v_fails, v_oldest
    from public.pin_attempts
   where membership_id = p_membership
     and not succeeded
     and attempted_at > now() - v_window
     and (v_last_success is null or attempted_at > v_last_success);

  if v_fails >= v_member_max then
    return greatest(0, ceil(extract(epoch from (v_oldest + v_window - now()))))::int;
  end if;

  select count(*), min(attempted_at)
    into v_fails, v_oldest
    from public.pin_attempts
   where kiosk_device_id = p_kiosk
     and not succeeded
     and attempted_at > now() - v_window;

  if v_fails >= v_kiosk_max then
    return greatest(0, ceil(extract(epoch from (v_oldest + v_window - now()))))::int;
  end if;

  return 0;
end;
$$;

create or replace function public.pin_record_attempt(
  p_tenant uuid,
  p_membership uuid,
  p_kiosk uuid,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pin_attempts (tenant_id, membership_id, kiosk_device_id, succeeded)
  values (p_tenant, p_membership, p_kiosk, p_success);

  -- Príležitostné upratovanie; 30 dní stačí na bezpečnostnú analýzu.
  if random() < 0.01 then
    delete from public.pin_attempts where attempted_at < now() - interval '30 days';
  end if;
end;
$$;

-- Admin reset PIN-u musí zároveň odomknúť účet, inak by zamestnanec čakal
-- na vypršanie okna aj s novým PIN-om.
create or replace function public.pin_clear_attempts(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.pin_attempts where membership_id = p_membership;
end;
$$;

revoke execute on function public.pin_locked_seconds(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.pin_record_attempt(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.pin_clear_attempts(uuid) from public, anon;

grant execute on function public.pin_locked_seconds(uuid, uuid) to service_role;
grant execute on function public.pin_record_attempt(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.pin_clear_attempts(uuid) to service_role, authenticated;
