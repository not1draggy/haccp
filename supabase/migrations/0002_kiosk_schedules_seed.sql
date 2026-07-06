-- =============================================================================
-- HACCP SaaS — 0002_kiosk_schedules_seed
-- Rozvrhy meraní + seed katalógu typov zariadení a legislatívnych limitov.
--
-- Spusti po 0001_core.sql.
--
-- ⚠️ Limity nižšie sú štandardné SK/EU hodnoty pre gastro prax, ale pred
--    predajom vyžadujú právnu verifikáciu a doplnenie legal_ref citácií.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rozvrhy meraní — kedy má byť zariadenie odmerané (podklad pre budúce
-- pg_cron missed-check alarmy; kiosk ich zobrazuje ako "dnes odmerať")
-- -----------------------------------------------------------------------------

create table public.schedules (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  device_id     uuid not null references public.devices(id) on delete cascade,
  due_time      time not null,
  tolerance_min int not null default 60 check (tolerance_min between 5 and 720),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index schedules_tenant_device on public.schedules(tenant_id, device_id);

alter table public.schedules enable row level security;

create policy schedules_read on public.schedules
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy schedules_admin_write on public.schedules
  for all to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin');

create trigger schedules_audit
  after insert or update or delete on public.schedules
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- Seed: typy zariadení (fixné UUID — README onboarding sa na ne odkazuje)
-- -----------------------------------------------------------------------------

insert into public.device_types (id, code, name) values
  ('a0000000-0000-0000-0000-000000000001', 'chladnicka',        'Chladnička'),
  ('a0000000-0000-0000-0000-000000000002', 'mraznicka',         'Mraznička'),
  ('a0000000-0000-0000-0000-000000000003', 'tepla_vitrina',     'Teplý pult / výdaj'),
  ('a0000000-0000-0000-0000-000000000004', 'chladiaca_vitrina', 'Chladiaca vitrína')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Seed: legislatívne limity (verzia platná od 2020-01-01, otvorený koniec)
--   Nová verzia limitu = uzavri valid_to a vlož nový riadok; merania si
--   ponechajú FK na verziu, podľa ktorej boli vyhodnotené.
-- -----------------------------------------------------------------------------

insert into public.rules (device_type_id, min_c, max_c, legal_ref, valid_from) values
  -- Chladnička: skladovanie chladených potravín 0 až +5 °C
  ('a0000000-0000-0000-0000-000000000001', 0.0, 5.0,
   'TODO: doplniť legal_ref (SK/EU, vyžaduje právnu verifikáciu)', '2020-01-01'),
  -- Mraznička: mrazené potraviny −18 °C a menej
  ('a0000000-0000-0000-0000-000000000002', null, -18.0,
   'TODO: doplniť legal_ref (SK/EU, vyžaduje právnu verifikáciu)', '2020-01-01'),
  -- Teplý pult / výdaj: teplé jedlá +60 °C a viac
  ('a0000000-0000-0000-0000-000000000003', 60.0, null,
   'TODO: doplniť legal_ref (SK/EU, vyžaduje právnu verifikáciu)', '2020-01-01'),
  -- Chladiaca vitrína: 0 až +5 °C
  ('a0000000-0000-0000-0000-000000000004', 0.0, 5.0,
   'TODO: doplniť legal_ref (SK/EU, vyžaduje právnu verifikáciu)', '2020-01-01');
