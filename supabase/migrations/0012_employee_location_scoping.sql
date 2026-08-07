-- =============================================================================
-- HACCP SaaS — 0012: priradenie zamestnancov k prevádzkam
--
-- PROBLÉM (anonymita medzi pobočkami): zamestnanci boli naviazaní len na firmu,
-- takže tablet v jednej pobočke ponúkal mená pracovníkov zo VŠETKÝCH pobočiek.
-- Pri franšízach alebo prevádzkach s odlišnými tímami je to únik — personál
-- jednej pobočky nemá dôvod vedieť, kto pracuje inde.
--
-- Zariadenia a párovacie kódy už boli viazané na prevádzku; chýbali len ľudia.
--
-- Väzba je M:N zámerne: vedúci alebo záskok reálne pokrýva viac pobočiek,
-- a nútiť ho do druhého konta by viedlo k zdieľaniu PIN-ov.
--
-- Overené: kiosk pobočky A nevidí zamestnanca ani zariadenie pobočky B a
-- naopak, pričom vlastných vidí.
-- =============================================================================

create table if not exists public.membership_locations (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  location_id   uuid not null references public.locations(id) on delete cascade,
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (membership_id, location_id)
);

create index if not exists membership_locations_location
  on public.membership_locations(location_id);

alter table public.membership_locations enable row level security;

drop policy if exists membership_locations_read on public.membership_locations;
create policy membership_locations_read on public.membership_locations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists membership_locations_admin_write on public.membership_locations;
create policy membership_locations_admin_write on public.membership_locations
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop trigger if exists membership_locations_audit on public.membership_locations;
create trigger membership_locations_audit
  after insert or update or delete on public.membership_locations
  for each row execute function public.audit_trigger();

-- Backfill: existujúci zamestnanci sa priradia ku všetkým prevádzkam svojej
-- firmy. Pri jednej prevádzke to zachová súčasné správanie; pri viacerých
-- si admin priradenie upraví — nechceme ticho odobrať prístup niekomu,
-- kto dnes meria. Dôsledok: po nasadení treba priradenie prejsť, inak sú
-- všetci naďalej vidieť všade.
insert into public.membership_locations (membership_id, location_id, tenant_id)
select m.id, l.id, m.tenant_id
  from public.memberships m
  join public.locations l on l.tenant_id = m.tenant_id
 where m.role = 'employee'
on conflict do nothing;
