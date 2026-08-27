-- =============================================================================
-- HACCP SaaS — 0017: obmedzenie pokusov o spárovanie tabletu
--
-- PROBLÉM: pairKiosk nemal žiadny limit pokusov. Párovací kód je JEDINÝ údaj,
-- ktorý stojí medzi útočníkom a prevádzkou — po uhádnutí získa device token a
-- s ním mená zamestnancov, zoznam zariadení, históriu meraní danej pobočky
-- a možnosť zapisovať merania.
--
-- Druhý, tichší následok: párovanie je zámerne opakovateľné (re-pair vydá nový
-- token), takže úspešné uhádnutie zároveň ODPOJÍ tablet v kuchyni. Kuchyňa
-- prestane merať a nikto nevie prečo.
--
-- Vlastný kód admina smie mať 4 znaky z [A-Z0-9] = 1,6 mil. kombinácií; to je
-- bez limitu uhádnuteľné. Limit je preto per IP, nie per kód — útočník skúša
-- rôzne kódy, nie ten istý.
--
-- Ukladá sa iba SHA-256 hash IP, nie IP samotná: na počítanie pokusov to stačí
-- a denník sa tým nestáva evidenciou toho, kto sa odkiaľ pripájal.
-- =============================================================================

create table if not exists public.pairing_attempts (
  id           bigint generated always as identity primary key,
  ip_hash      text not null,
  succeeded    boolean not null,
  attempted_at timestamptz not null default now()
);

create index if not exists pairing_attempts_ip
  on public.pairing_attempts(ip_hash, attempted_at desc);

-- Prevádzkové dáta, nie governed tabuľka — bez audit triggera, inak by
-- skenovanie kódov zaplavilo audit_log.
alter table public.pairing_attempts enable row level security;
-- Žiadna policy = žiadny prístup pre anon/authenticated. Zapisuje iba
-- service role z kiosk server action.
revoke all on public.pairing_attempts from anon, authenticated;

create or replace function public.pairing_locked_seconds(p_ip_hash text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window interval := interval '15 minutes';
  v_max    int := 10;
  v_fails  int;
  v_oldest timestamptz;
begin
  select count(*), min(attempted_at)
    into v_fails, v_oldest
    from public.pairing_attempts
   where ip_hash = p_ip_hash
     and not succeeded
     and attempted_at > now() - v_window;

  if v_fails >= v_max then
    return greatest(0, ceil(extract(epoch from (v_oldest + v_window - now()))))::int;
  end if;

  return 0;
end;
$$;

create or replace function public.pairing_record_attempt(
  p_ip_hash text,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.pairing_attempts (ip_hash, succeeded)
  values (p_ip_hash, p_success);

  -- Úspešné spárovanie vynuluje sériu — tablet, ktorý sa raz trafil, nemá
  -- doplácať na to, že personál predtým dvakrát preklepol kód.
  if p_success then
    delete from public.pairing_attempts
     where ip_hash = p_ip_hash and not succeeded;
  end if;

  if random() < 0.01 then
    delete from public.pairing_attempts where attempted_at < now() - interval '30 days';
  end if;
end;
$$;

revoke execute on function public.pairing_locked_seconds(text) from public, anon, authenticated;
revoke execute on function public.pairing_record_attempt(text, boolean) from public, anon, authenticated;

grant execute on function public.pairing_locked_seconds(text) to service_role;
grant execute on function public.pairing_record_attempt(text, boolean) to service_role;
