-- =============================================================================
-- HACCP SaaS — 0018: zovšeobecnenie limitu pokusov + oprava pin_clear_attempts
--
-- 1. REGISTRÁCIA BEZ LIMITU. /registracia je verejný neautentifikovaný
--    endpoint, ktorý zakladá auth účet, firmu, prevádzku aj tablet. Bez
--    obmedzenia sa dá skriptom vyrobiť ľubovoľný počet firiem — plnená
--    databáza, plnená tabuľka auth.users a účet za Supabase.
--
--    Tabuľka z 0017 je na to presne to isté počítadlo, len s iným účelom,
--    preto dostáva stĺpec `scope` a neutrálny názov. Migrácia beží nad
--    tabuľkou, ktorá vznikla pred pár minútami a nemá dáta, o ktoré by šlo.
--
-- 2. pin_clear_attempts NEOVEROVALA FIRMU. Funkcia je zámerne dostupná
--    prihlásenému adminovi (reset PIN-u musí účet odomknúť), ale brala
--    ľubovoľné membership_id bez kontroly, komu patrí. Ktorýkoľvek admin tak
--    mohol nulovať počítadlo neúspešných PIN-ov cudzej firme — teda obchádzať
--    ochranu proti hádaniu PIN-u pre pracovníka, ktorého vôbec nespravuje.
--    Nález lintera „SECURITY DEFINER executable by authenticated"; funkcia
--    ostáva volateľná, len si po novom overí tenanta volajúceho.
--
-- POZNÁMKA k current_tenant_id() a current_app_role(): linter ich hlási
-- rovnakým pravidlom, ale odobrať im EXECUTE sa NESMIE — sú základom každej
-- RLS policy a policy sa vyhodnocuje právami volajúceho. Overené: po
-- `revoke execute ... from authenticated` skončí každé čítanie na
-- 42501 „permission denied for function current_tenant_id". Nález je pre
-- tento návrh falošne pozitívny.
-- =============================================================================

-- ------------------------------------------- 1. zovšeobecnené počítadlo IP
alter table public.pairing_attempts
  add column if not exists scope text not null default 'pairing';

alter table public.pairing_attempts rename to rate_limit_attempts;
alter index if exists pairing_attempts_ip rename to rate_limit_attempts_ip;

drop index if exists rate_limit_attempts_ip;
create index if not exists rate_limit_attempts_scope_ip
  on public.rate_limit_attempts(scope, ip_hash, attempted_at desc);

revoke all on public.rate_limit_attempts from anon, authenticated;

drop function if exists public.pairing_locked_seconds(text);
drop function if exists public.pairing_record_attempt(text, boolean);

create or replace function public.rate_limit_locked_seconds(
  p_scope text,
  p_ip_hash text
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window interval;
  v_max    int;
  v_fails  int;
  v_oldest timestamptz;
begin
  -- Párovanie zadáva personál ručne z papiera, preklepy sú bežné → voľnejší
  -- limit. Registrácia firmy je jednorazový úkon, tam je päť pokusov za
  -- hodinu viac než dosť.
  if p_scope = 'signup' then
    v_window := interval '60 minutes';
    v_max    := 5;
  else
    v_window := interval '15 minutes';
    v_max    := 10;
  end if;

  select count(*), min(attempted_at)
    into v_fails, v_oldest
    from public.rate_limit_attempts
   where scope = p_scope
     and ip_hash = p_ip_hash
     and not succeeded
     and attempted_at > now() - v_window;

  if v_fails >= v_max then
    return greatest(0, ceil(extract(epoch from (v_oldest + v_window - now()))))::int;
  end if;

  return 0;
end;
$$;

create or replace function public.rate_limit_record_attempt(
  p_scope text,
  p_ip_hash text,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rate_limit_attempts (scope, ip_hash, succeeded)
  values (p_scope, p_ip_hash, p_success);

  if p_success then
    delete from public.rate_limit_attempts
     where scope = p_scope and ip_hash = p_ip_hash and not succeeded;
  end if;

  if random() < 0.01 then
    delete from public.rate_limit_attempts where attempted_at < now() - interval '30 days';
  end if;
end;
$$;

revoke execute on function public.rate_limit_locked_seconds(text, text) from public, anon, authenticated;
revoke execute on function public.rate_limit_record_attempt(text, text, boolean) from public, anon, authenticated;
grant execute on function public.rate_limit_locked_seconds(text, text) to service_role;
grant execute on function public.rate_limit_record_attempt(text, text, boolean) to service_role;

-- --------------------------------------------- 2. pin_clear_attempts scoping
create or replace function public.pin_clear_attempts(p_membership uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Service role (kiosk/servis) nemá tenant claim a smie všetko; prihlásený
  -- admin smie nulovať iba pracovníka vlastnej firmy.
  if auth.uid() is not null then
    if not exists (
      select 1 from public.memberships m
       where m.id = p_membership
         and m.tenant_id = public.current_tenant_id()
    ) then
      raise exception 'Zamestnanec nepatrí do tvojej firmy.';
    end if;
  end if;

  delete from public.pin_attempts where membership_id = p_membership;
end;
$$;

revoke execute on function public.pin_clear_attempts(uuid) from public, anon;
grant execute on function public.pin_clear_attempts(uuid) to service_role, authenticated;
