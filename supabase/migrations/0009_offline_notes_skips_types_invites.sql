-- =============================================================================
-- HACCP SaaS — 0009
-- Schéma pre offline frontu, foto k meraniu, preskočené kontroly,
-- vlastné typy zariadení, pozvánky adminov a deaktiváciu prevádzok.
--
-- Kroky sú idempotentné: apply_migration neprebehla atomicky, takže migrácia
-- musí zniesť opakované spustenie.
-- =============================================================================

-- --------------------------------------------------------- Offline idempotencia
-- Kiosk pri výpadku wifi drží merania lokálne a po obnovení ich odošle.
-- Bez kľúča od klienta by opakované odoslanie vytvorilo duplicitné meranie,
-- ktoré sa už NEDÁ zmazať (append-only) — kontrolór by videl dva zápisy.
alter table public.measurements add column if not exists client_uuid uuid;
create unique index if not exists measurements_client_uuid
  on public.measurements(tenant_id, client_uuid)
  where client_uuid is not null;

-- ------------------------------------------------------------- Foto k meraniu
-- Cesta v Storage buckete; samotný súbor tam, nie v DB.
alter table public.measurements add column if not exists photo_path text;

-- ------------------------------------------------------- Preskočené kontroly
-- Zámerne NIE ako measurement so status='skipped': meranie musí mať nameranú
-- hodnotu (value_c not null). "Nemeralo sa, lebo bola prevádzka zatvorená"
-- je iný druh záznamu a patrí vedľa, nie dovnútra žurnálu meraní.
create table if not exists public.check_skips (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  location_id   uuid not null references public.locations(id) on delete cascade,
  device_id     uuid not null references public.devices(id),
  membership_id uuid not null references public.memberships(id),
  reason        text not null check (length(btrim(reason)) between 1 and 500),
  skipped_at    timestamptz not null default now()
);

create index if not exists check_skips_tenant_time on public.check_skips(tenant_id, skipped_at desc);
create index if not exists check_skips_device on public.check_skips(device_id, skipped_at desc);

drop trigger if exists check_skips_append_only on public.check_skips;
create trigger check_skips_append_only
  before update or delete on public.check_skips
  for each row execute function public.block_mutation();

revoke update, delete on public.check_skips from anon, authenticated;

drop trigger if exists check_skips_audit on public.check_skips;
create trigger check_skips_audit
  after insert on public.check_skips
  for each row execute function public.audit_trigger();

alter table public.check_skips enable row level security;
drop policy if exists check_skips_read on public.check_skips;
create policy check_skips_read on public.check_skips
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

-- ---------------------------------------------------- Vlastné typy zariadení
-- tenant_id null = globálny katalóg spravovaný platformou.
alter table public.device_types add column if not exists tenant_id uuid
  references public.tenants(id) on delete cascade;
create index if not exists device_types_tenant on public.device_types(tenant_id);

-- Kód musí byť unikátny v rámci vlastníka, nie globálne — inak by si tenant
-- nemohol založiť typ s bežným názvom.
alter table public.device_types drop constraint if exists device_types_code_key;
create unique index if not exists device_types_code_global
  on public.device_types(code) where tenant_id is null;
create unique index if not exists device_types_code_per_tenant
  on public.device_types(tenant_id, code) where tenant_id is not null;

drop policy if exists device_types_read on public.device_types;
create policy device_types_read on public.device_types
  for select to authenticated
  using (tenant_id is null or tenant_id = public.current_tenant_id());

drop policy if exists device_types_admin_write on public.device_types;
create policy device_types_admin_write on public.device_types
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop trigger if exists device_types_audit on public.device_types;
create trigger device_types_audit
  after insert or update or delete on public.device_types
  for each row execute function public.audit_trigger();

-- ------------------------------------------------------------ Pozvánky adminov
-- Doteraz sa druhý admin pridával ručne cez SQL. Token sa ukladá iba ako
-- SHA-256 hash — rovnaký princíp ako device token kiosku.
create table if not exists public.invitations (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  display_name text not null,
  token_hash   text not null unique,
  invited_by   uuid references auth.users(id) on delete set null,
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists invitations_tenant on public.invitations(tenant_id, created_at desc);

alter table public.invitations enable row level security;
drop policy if exists invitations_admin_read on public.invitations;
create policy invitations_admin_read on public.invitations
  for select to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop policy if exists invitations_admin_write on public.invitations;
create policy invitations_admin_write on public.invitations
  for all to authenticated
  using (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (tenant_id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');

drop trigger if exists invitations_audit on public.invitations;
create trigger invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function public.audit_trigger();

-- --------------------------------------------------------------- Viac prevádzok
-- Prevádzky sa rovnako ako zariadenia nemažú, iba deaktivujú.
alter table public.locations add column if not exists active boolean not null default true;
