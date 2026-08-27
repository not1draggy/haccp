-- =============================================================================
-- Seed pre lokálny vývoj a E2E testy
--
-- Načíta sa automaticky pri `supabase start` / `supabase db reset`.
-- NIE je súčasťou migrácií, takže sa do produkcie nikdy nedostane.
--
-- Dáta sú zámerne deterministické — E2E testy sa spoliehajú na párovací kód
-- aj na PIN nižšie. Meniť ich znamená meniť aj testy v `e2e/`.
-- =============================================================================

insert into public.tenants (id, name) values
  ('11111111-1111-4111-8111-111111111111', 'E2E Reštaurácia')
on conflict (id) do nothing;

insert into public.locations (id, tenant_id, name) values
  ('22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'Hlavná prevádzka'),
  -- Druhá prevádzka slúži na overenie, že sa jej dáta neukážu na tablete prvej.
  ('22222222-2222-4222-8222-222222222233',
   '11111111-1111-4111-8111-111111111111', 'Vedľajšia prevádzka')
on conflict (id) do nothing;

-- PIN prevádzky je 9876 (PIN zamestnanca je 4321 — zámerne iné, aby test
-- odhalil, keby sa jeden použil namiesto druhého).
insert into public.kiosk_devices (id, tenant_id, location_id, name, pairing_code, pin_hash) values
  ('33333333-3333-4333-8333-333333333333',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222', 'Tablet kuchyňa', 'E2ETEST',
   '$2a$10$iV2w5xBFlBXeRBKb1LZD3O02aGvjS4djRoyPZZ0LDOB6y1kOqFudW'),
  -- Tablet bez PIN-u: prihlásenie musí odmietnuť, nie ho pustiť na kód.
  ('33333333-3333-4333-8333-333333333344',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222', 'Tablet bez PIN', 'NOPIN1', null)
on conflict (id) do nothing;

insert into public.devices (id, tenant_id, location_id, device_type_id, name, sort_order) values
  ('44444444-4444-4444-8444-444444444444',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-0000-0000-000000000001', 'Chladnička kuchyňa', 1),
  ('44444444-4444-4444-8444-444444444455',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222222',
   'a0000000-0000-0000-0000-000000000002', 'Mraznička sklad', 2),
  -- Zariadenie vedľajšej prevádzky — na tablete sa NESMIE objaviť.
  ('44444444-4444-4444-8444-444444444466',
   '11111111-1111-4111-8111-111111111111',
   '22222222-2222-4222-8222-222222222233',
   'a0000000-0000-0000-0000-000000000001', 'Chladnička vedľajšia', 3)
on conflict (id) do nothing;

-- PIN oboch zamestnancov je 4321.
insert into public.memberships (id, tenant_id, role, display_name, pin_hash, active) values
  ('55555555-5555-4555-8555-555555555555',
   '11111111-1111-4111-8111-111111111111', 'employee', 'Anna Kuchárka',
   '$2a$10$TCe66GK7vFzag8M9YTsowuvXKT3zms1LfqQLyZTYdVmqkIW0qaJ0W', true),
  -- Zamestnanec vedľajšej prevádzky — na tablete sa NESMIE objaviť.
  ('55555555-5555-4555-8555-555555555566',
   '11111111-1111-4111-8111-111111111111', 'employee', 'Cudzí Kuchár',
   '$2a$10$TCe66GK7vFzag8M9YTsowuvXKT3zms1LfqQLyZTYdVmqkIW0qaJ0W', true)
on conflict (id) do nothing;

insert into public.membership_locations (membership_id, location_id, tenant_id) values
  ('55555555-5555-4555-8555-555555555555',
   '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111'),
  ('55555555-5555-4555-8555-555555555566',
   '22222222-2222-4222-8222-222222222233',
   '11111111-1111-4111-8111-111111111111')
on conflict do nothing;
