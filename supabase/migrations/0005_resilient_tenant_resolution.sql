-- =============================================================================
-- HACCP SaaS — 0005_resilient_tenant_resolution
--
-- PROBLÉM: tenant/rola sa čítali výhradne z JWT claims, ktoré napĺňa
-- custom_access_token_hook. Ak hook nie je aktivovaný v Dashboarde alebo má
-- používateľ token vydaný pred jeho aktiváciou, RLS nepustí admina k žiadnym
-- dátam a celá administrácia vyzerá pokazene. Jeden prepínač v Dashboarde bol
-- tvrdou závislosťou celej aplikácie.
--
-- RIEŠENIE: resolúcia tenanta má dve úrovne — claim z JWT (rýchla cesta, bez
-- dotazu) a fallback lookup memberships podľa auth.uid(). Hook je odteraz iba
-- optimalizácia, nie podmienka funkčnosti.
--
-- BEZPEČNOSŤ: funkcie sú SECURITY DEFINER, aby čítanie memberships nespúšťalo
-- RLS a nevznikla nekonečná rekurzia (memberships policy sama volá tieto
-- funkcie). Lookup je viazaný na auth.uid(), takže používateľ nikdy nemôže
-- získať cudzí tenant — overené testom s neznámym UUID.
-- =============================================================================

create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  v_tenant := nullif(
    coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'tenant_id',
    ''
  )::uuid;
  if v_tenant is not null then
    return v_tenant;
  end if;

  select m.tenant_id
    into v_tenant
    from public.memberships m
   where m.user_id = auth.uid()
     and m.active
   order by m.created_at
   limit 1;

  return v_tenant;
end;
$$;

create or replace function public.current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := nullif(
    coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'app_role',
    ''
  );
  if v_role is not null then
    return v_role;
  end if;

  select m.role
    into v_role
    from public.memberships m
   where m.user_id = auth.uid()
     and m.active
   order by m.created_at
   limit 1;

  return v_role;
end;
$$;

-- Prepnutie všetkých policies na odolné funkcie.

drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants
  for select to authenticated
  using (id = public.current_tenant_id());

drop policy if exists locations_read on public.locations;
create policy locations_read on public.locations
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists locations_admin_write on public.locations;
create policy locations_admin_write on public.locations
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop policy if exists memberships_read on public.memberships;
create policy memberships_read on public.memberships
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists memberships_admin_write on public.memberships;
create policy memberships_admin_write on public.memberships
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop policy if exists devices_read on public.devices;
create policy devices_read on public.devices
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists devices_admin_write on public.devices;
create policy devices_admin_write on public.devices
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop policy if exists kiosk_devices_read on public.kiosk_devices;
create policy kiosk_devices_read on public.kiosk_devices
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists kiosk_devices_admin_write on public.kiosk_devices;
create policy kiosk_devices_admin_write on public.kiosk_devices
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop policy if exists measurements_read on public.measurements;
create policy measurements_read on public.measurements
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop policy if exists schedules_read on public.schedules;
create policy schedules_read on public.schedules
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

drop policy if exists schedules_admin_write on public.schedules;
create policy schedules_admin_write on public.schedules
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');
