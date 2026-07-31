-- =============================================================================
-- Test izolácie tenantov (RLS)
--
-- Únik dát medzi prevádzkami je pri tomto produkte fatálny — konkurenčné
-- reštaurácie by si videli do teplotných denníkov. Tento skript to overuje
-- reálnym dotazom cez rolu `authenticated`, nie čítaním policies.
--
-- SPUSTENIE: skopíruj celý súbor do Supabase SQL Editora a spusti naraz.
-- Celý beh je v transakcii ukončenej ROLLBACKom, takže v DB nič nezostane —
-- overené aj tým, že audit_log nezachytí žiadny testovací záznam.
--
-- PRED SPUSTENÍM nastav dve hodnoty nižšie podľa svojho prostredia.
-- =============================================================================

begin;

-- ⬇️ UPRAV: existujúci tenant a UUID jeho admina (Authentication → Users)
\set tenant_a  '11111111-1111-1111-1111-111111111111'
\set admin_a   '55b1ffa3-3720-4199-9a60-a6fae547055f'

-- ---------------------------------------------------------------------------
-- Založíme cudzieho tenanta so všetkým, čo by nemal byť vidieť.
-- ---------------------------------------------------------------------------

insert into tenants (id, name) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TEST Konkurencia s.r.o.');

insert into locations (id, tenant_id, name) values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cudzia prevádzka');

insert into devices (id, tenant_id, location_id, device_type_id, name) values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'cccccccc-cccc-cccc-cccc-cccccccccccc',
   'a0000000-0000-0000-0000-000000000001', 'Cudzia chladnička');

insert into memberships (id, tenant_id, role, display_name, pin_hash) values
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'employee', 'Cudzí kuchár', 'x');

-- ---------------------------------------------------------------------------
-- Vžijeme sa do admina tenanta A. Zámerne BEZ tenant_id claimu, aby sa
-- otestovala aj fallback vetva current_tenant_id().
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claims',
  format('{"sub":"%s","role":"authenticated"}', :'admin_a'),
  true
);

-- ---------------------------------------------------------------------------
-- Vyhodnotenie. Všetky stĺpce musia byť PASS.
-- ---------------------------------------------------------------------------

select
  case when (select count(*) from tenants) = 1
       then 'PASS' else 'FAIL' end as vidi_iba_svojho_tenanta,
  case when (select count(*) from devices
              where name = 'Cudzia chladnička') = 0
       then 'PASS' else 'FAIL' end as nevidi_cudzie_zariadenie,
  case when (select count(*) from memberships
              where display_name = 'Cudzí kuchár') = 0
       then 'PASS' else 'FAIL' end as nevidi_cudzieho_zamestnanca,
  case when (select count(*) from locations
              where name = 'Cudzia prevádzka') = 0
       then 'PASS' else 'FAIL' end as nevidi_cudziu_prevadzku,
  case when current_tenant_id() = :'tenant_a'::uuid
       then 'PASS' else 'FAIL' end as fallback_resolucia_funguje;

-- Neznámy používateľ nesmie dostať nič.
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000ff","role":"authenticated"}',
  true
);

select
  case when current_tenant_id() is null
       then 'PASS' else 'FAIL' end as cudzinec_nema_tenanta,
  case when (select count(*) from tenants) = 0
       then 'PASS' else 'FAIL' end as cudzinec_nevidi_nic;

rollback;
