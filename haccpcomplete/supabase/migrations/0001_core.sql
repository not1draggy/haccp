-- =============================================================================
-- HACCP SaaS — 0001_core
-- Jadro schémy: tenanti, prevádzky, členstvá, zariadenia, kiosky, merania,
-- verzované pravidlá, audit log, RLS, JWT claims hook.
--
-- Spusti ako prvý v SQL Editore Supabase projektu.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tenanti a prevádzky
-- -----------------------------------------------------------------------------

create table public.tenants (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index locations_tenant on public.locations(tenant_id);

-- -----------------------------------------------------------------------------
-- Členstvá
--   tenant_admin — viazaný na auth.users, prihlasuje sa emailom/heslom
--   employee     — žiadny účet, identifikuje sa PIN-om na kiosku (audit trail)
-- -----------------------------------------------------------------------------

create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete set null,
  role         text not null check (role in ('tenant_admin', 'employee')),
  display_name text not null,
  pin_hash     text,  -- bcrypt; iba pre employee
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint admin_needs_user  check (role <> 'tenant_admin' or user_id is not null),
  constraint employee_needs_pin check (role <> 'employee' or pin_hash is not null)
);

create unique index memberships_user_per_tenant
  on public.memberships(tenant_id, user_id) where user_id is not null;
create index memberships_tenant on public.memberships(tenant_id);

-- -----------------------------------------------------------------------------
-- Katalóg typov zariadení (globálny, spravuje platforma)
-- -----------------------------------------------------------------------------

create table public.device_types (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Verzované legislatívne pravidlá (limity teplôt per typ zariadenia)
--   Nový limit = nový riadok s valid_from; starý sa uzavrie cez valid_to.
--   Merania si držia FK na konkrétnu verziu pravidla, podľa ktorej boli
--   vyhodnotené — spätná zmena limitu nemení históriu.
-- -----------------------------------------------------------------------------

create table public.rules (
  id             uuid primary key default gen_random_uuid(),
  device_type_id uuid not null references public.device_types(id),
  min_c          numeric(5,1),
  max_c          numeric(5,1),
  legal_ref      text,  -- citácia predpisu; TODO pred predajom doplniť a overiť
  valid_from     date not null,
  valid_to       date, -- null = aktuálne platné
  created_at     timestamptz not null default now(),
  constraint rules_has_bound check (min_c is not null or max_c is not null),
  constraint rules_validity  check (valid_to is null or valid_to > valid_from)
);

create index rules_type_validity on public.rules(device_type_id, valid_from desc);

-- -----------------------------------------------------------------------------
-- Zariadenia prevádzky (chladničky, mrazničky, pulty…)
-- -----------------------------------------------------------------------------

create table public.devices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  location_id    uuid not null references public.locations(id) on delete cascade,
  device_type_id uuid not null references public.device_types(id),
  name           text not null,
  sort_order     int not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create index devices_tenant_location on public.devices(tenant_id, location_id);

-- -----------------------------------------------------------------------------
-- Kiosky (tablety v kuchyni)
--   Tablet sa spáruje jednorazovým pairing_code; potom drží náhodný token
--   v httpOnly cookie, v DB je iba jeho SHA-256 hash. Žiadne osobné sessions.
-- -----------------------------------------------------------------------------

create table public.kiosk_devices (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  location_id       uuid not null references public.locations(id) on delete cascade,
  name              text not null,
  pairing_code      text not null unique,
  device_token_hash text,        -- sha256 hex; null = zatiaľ nespárovaný
  paired_at         timestamptz,
  last_seen_at      timestamptz,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index kiosk_devices_token on public.kiosk_devices(device_token_hash)
  where device_token_hash is not null;

-- -----------------------------------------------------------------------------
-- Merania — append-only žurnál
-- -----------------------------------------------------------------------------

create table public.measurements (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id),
  location_id     uuid not null references public.locations(id),
  device_id       uuid not null references public.devices(id),
  membership_id   uuid not null references public.memberships(id),
  kiosk_device_id uuid references public.kiosk_devices(id),
  rule_id         uuid references public.rules(id),
  value_c         numeric(5,1) not null,
  status          text not null check (status in ('ok', 'alarm')),
  note            text,
  measured_at     timestamptz not null default now()
);

create index measurements_tenant_time on public.measurements(tenant_id, measured_at desc);
create index measurements_alarms on public.measurements(tenant_id, measured_at desc)
  where status = 'alarm';

-- Append-only na úrovni DB: trigger blokuje UPDATE/DELETE pre všetkých
-- vrátane service role; grants navyše odoberáme klientskym rolám.

create or replace function public.block_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tabuľka % je append-only — UPDATE/DELETE nie je povolený.', tg_table_name;
end;
$$;

create trigger measurements_append_only
  before update or delete on public.measurements
  for each row execute function public.block_mutation();

revoke update, delete on public.measurements from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Audit log — každá mutácia governed tabuliek; priamy zápis zakázaný
-- -----------------------------------------------------------------------------

create table public.audit_log (
  id         bigint generated always as identity primary key,
  tenant_id  uuid,
  table_name text not null,
  op         text not null,
  row_id     uuid,
  actor      uuid,  -- auth.uid() ak mutáciu robí prihlásený používateľ
  at         timestamptz not null default now(),
  old_data   jsonb,
  new_data   jsonb
);

create index audit_log_tenant_time on public.audit_log(tenant_id, at desc);

revoke insert, update, delete on public.audit_log from anon, authenticated;

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function public.block_mutation();

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.audit_log (tenant_id, table_name, op, row_id, actor, old_data, new_data)
  values (
    coalesce(
      (v_new ->> 'tenant_id')::uuid,
      (v_old ->> 'tenant_id')::uuid,
      case when tg_table_name = 'tenants'
        then coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid) end
    ),
    tg_table_name,
    tg_op,
    coalesce((v_new ->> 'id')::uuid, (v_old ->> 'id')::uuid),
    auth.uid(),
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

create trigger tenants_audit       after insert or update or delete on public.tenants       for each row execute function public.audit_trigger();
create trigger locations_audit     after insert or update or delete on public.locations     for each row execute function public.audit_trigger();
create trigger memberships_audit   after insert or update or delete on public.memberships   for each row execute function public.audit_trigger();
create trigger devices_audit       after insert or update or delete on public.devices       for each row execute function public.audit_trigger();
create trigger kiosk_devices_audit after insert or update or delete on public.kiosk_devices for each row execute function public.audit_trigger();
create trigger rules_audit         after insert or update or delete on public.rules         for each row execute function public.audit_trigger();
create trigger measurements_audit  after insert on public.measurements                       for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- JWT claims hook — do access tokenu pridá tenant_id a app_role.
-- Po spustení migrácie AKTIVUJ v Dashboard:
--   Authentication → Hooks → Customize Access Token (JWT) Claims
--   → public.custom_access_token_hook
-- Bez toho RLS nepustí admina k žiadnym dátam.
-- -----------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb := event -> 'claims';
  m record;
begin
  select tenant_id, role
    into m
    from public.memberships
   where user_id = (event ->> 'user_id')::uuid
     and active
   order by created_at
   limit 1;

  if found then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(m.tenant_id::text));
    claims := jsonb_set(claims, '{app_role}', to_jsonb(m.role));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
grant select on public.memberships to supabase_auth_admin;

-- -----------------------------------------------------------------------------
-- RLS helpery — čítajú claims z JWT (naplní ich hook vyššie)
-- -----------------------------------------------------------------------------

create or replace function public.jwt_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'tenant_id',
    ''
  )::uuid;
$$;

create or replace function public.jwt_app_role()
returns text
language sql
stable
as $$
  select coalesce(current_setting('request.jwt.claims', true), '{}')::jsonb ->> 'app_role';
$$;

-- -----------------------------------------------------------------------------
-- RLS
--   Čítanie: všetci členovia tenanta (podľa tenant_id z JWT).
--   Zápis konfigurácie: iba tenant_admin.
--   Merania: INSERT ide výhradne cez service role (kiosk server actions),
--   klientske roly majú iba SELECT.
-- -----------------------------------------------------------------------------

alter table public.tenants       enable row level security;
alter table public.locations     enable row level security;
alter table public.memberships   enable row level security;
alter table public.device_types  enable row level security;
alter table public.rules         enable row level security;
alter table public.devices       enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.measurements  enable row level security;
alter table public.audit_log     enable row level security;

create policy tenants_read on public.tenants
  for select to authenticated
  using (id = public.jwt_tenant_id());

create policy locations_read on public.locations
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy locations_admin_write on public.locations
  for all to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin');

create policy memberships_read on public.memberships
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy memberships_admin_write on public.memberships
  for all to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin');

-- Globálny katalóg a pravidlá: čítanie pre všetkých prihlásených,
-- zápis iba service role (platforma).
create policy device_types_read on public.device_types
  for select to authenticated
  using (true);

create policy rules_read on public.rules
  for select to authenticated
  using (true);

create policy devices_read on public.devices
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy devices_admin_write on public.devices
  for all to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin');

create policy kiosk_devices_read on public.kiosk_devices
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id());

create policy kiosk_devices_admin_write on public.kiosk_devices
  for all to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin')
  with check (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin');

create policy measurements_read on public.measurements
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id());
-- INSERT policy zámerne chýba — merania zapisuje iba service role.

create policy audit_log_admin_read on public.audit_log
  for select to authenticated
  using (tenant_id = public.jwt_tenant_id() and public.jwt_app_role() = 'tenant_admin');
