-- =============================================================================
-- HACCP SaaS — 0020: explicitné práva pre API role
--
-- Schéma sa doteraz spoliehala na to, že Supabase pridelí rolám `anon`,
-- `authenticated` a `service_role` práva na nové tabuľky sama. Na hostovanom
-- projekte to platí, v čistej databáze nie — tam `service_role` nedostane ani
-- SELECT a appka spadne na `permission denied for table rules` hneď pri
-- načítaní kiosku.
--
-- Prečo to nie je len problém CI: presne toto nastane pri **obnove zo zálohy
-- do nového projektu**. Merania sú append-only a záloha je jediná poistka,
-- takže migrácie musia vedieť postaviť funkčnú databázu samy, bez implicitnej
-- pomoci platformy.
--
-- Migrácia iba PRIDÁVA práva a presne kopíruje stav, ktorý má produkcia dnes.
-- Zámerne neobsahuje žiadny REVOKE: odobratia z 0001, 0007, 0009, 0010 a 0016
-- musia zostať v platnosti a `grant` tu nesmie žiadne z nich zrušiť.
--
-- Pozn.: `anon` má na konfiguračných tabuľkách plné DML. Vyzerá to alarmujúco,
-- ale je to východzí stav platformy a chráni ich RLS — `anon` nemá ani jednu
-- policy, takže sa k riadkom nedostane. Sprísnenie je samostatné rozhodnutie,
-- nie vedľajší efekt tejto opravy (zapísané v ROADMAP.md).
-- =============================================================================

-- service_role obsluhuje kiosk a musí na všetko; UPDATE/DELETE na append-only
-- tabuľkách blokuje trigger `block_mutation`, nie chýbajúce právo.
grant select, insert, update, delete on all tables in schema public to service_role;

-- Konfiguračné tabuľky — plné DML, prístup rieši RLS.
grant select, insert, update, delete on
  public.tenants, public.locations, public.memberships,
  public.membership_locations, public.device_types, public.devices,
  public.schedules, public.kiosk_devices, public.invitations
  to anon, authenticated;

-- Append-only a odvodené tabuľky — klient smie iba čítať.
grant select on
  public.rules, public.measurements, public.audit_log, public.missed_checks
  to anon, authenticated;

-- Zapisovať smie klient len tam, kde záznam pridáva, ale nesmie ho meniť.
grant select, insert on
  public.check_skips, public.corrective_actions
  to anon, authenticated;

-- pin_attempts a rate_limit_attempts zostávajú pre klienta úplne zavreté
-- (0008, 0018) — počítadlo pokusov nesmie vidieť ani nulovať ten, koho
-- má obmedzovať. Preto tu zámerne nie sú.
