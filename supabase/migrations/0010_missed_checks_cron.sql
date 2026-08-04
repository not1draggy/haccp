-- =============================================================================
-- HACCP SaaS — 0010: evidencia zmeškaných kontrol
--
-- Rozvrh (schedules) doteraz nikto nevyhodnocoval. Ak sa na zariadenie zabudlo,
-- nikde to nezostalo — a kontrolór sa práve na chýbajúce záznamy pýta.
-- Cron zapisuje trvalý záznam „o 10:00 nebola chladnička odmeraná", takže
-- zmeškanie je súčasťou auditnej stopy aj keď sa nikto nepozrie do dashboardu.
--
-- Overené: prvý beh zapíše zmeškanie, druhý nie (idempotencia cez unique
-- (schedule_id, due_at)), odmerané zariadenie sa medzi zmeškané nedostane.
-- =============================================================================

create extension if not exists pg_cron;

create table if not exists public.missed_checks (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  device_id   uuid not null references public.devices(id),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  due_at      timestamptz not null,
  detected_at timestamptz not null default now(),
  unique (schedule_id, due_at)
);

create index if not exists missed_checks_tenant_time
  on public.missed_checks(tenant_id, due_at desc);

alter table public.missed_checks enable row level security;

drop policy if exists missed_checks_read on public.missed_checks;
create policy missed_checks_read on public.missed_checks
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- Zapisuje výhradne cron; ručný zápis nedáva zmysel a menil by auditnú stopu.
revoke insert, update, delete on public.missed_checks from anon, authenticated;

drop trigger if exists missed_checks_append_only on public.missed_checks;
create trigger missed_checks_append_only
  before update or delete on public.missed_checks
  for each row execute function public.block_mutation();

create or replace function public.record_missed_checks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  with due as (
    select
      s.id            as schedule_id,
      s.tenant_id,
      d.location_id,
      s.device_id,
      s.tolerance_min,
      -- due_time je lokálny čas prevádzky, nie UTC
      (((now() at time zone 'Europe/Bratislava')::date + s.due_time)
         at time zone 'Europe/Bratislava') as due_at,
      (((now() at time zone 'Europe/Bratislava')::date)
         at time zone 'Europe/Bratislava') as day_start
    from public.schedules s
    join public.devices d on d.id = s.device_id and d.active
    where s.active
  ),
  overdue as (
    select * from due
     where now() > due_at + make_interval(mins => tolerance_min)
  ),
  missing as (
    select o.*
      from overdue o
     where not exists (
       select 1 from public.measurements m
        where m.device_id = o.device_id
          and m.measured_at >= o.day_start
          and m.measured_at <= now()
     )
       -- Vedome preskočená kontrola s dôvodom nie je zmeškaná.
       and not exists (
         select 1 from public.check_skips k
          where k.device_id = o.device_id
            and k.skipped_at >= o.day_start
            and k.skipped_at <= now()
       )
  )
  insert into public.missed_checks (tenant_id, location_id, device_id, schedule_id, due_at)
  select tenant_id, location_id, device_id, schedule_id, due_at from missing
  on conflict (schedule_id, due_at) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.record_missed_checks() from public, anon, authenticated;

-- Naplánovanie (spúšťa sa mimo migrácie, aby sa dala migrácia opakovať):
--   select cron.schedule('haccp-missed-checks', '*/15 * * * *',
--                        $$select public.record_missed_checks()$$);
