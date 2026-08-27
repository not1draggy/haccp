-- =============================================================================
-- Test izolácie ZÁPISOV medzi firmami
--
-- Doplnok k rls_isolation_test.sql, ktorý overuje čítanie. Tento skript overuje
-- opačný smer: či sa dá cez API zapísať tam, kam volajúci nepatrí. Každý prípad
-- je regresný test konkrétneho nálezu z bezpečnostného auditu — všetky štyri
-- boli pred migráciami 0016–0018 reálne priechodné.
--
-- SPUSTENIE: skopíruj celý súbor do Supabase SQL Editora a spusti naraz.
-- Nič sa nenastavuje ručne — skript si založí vlastné firmy aj používateľa
-- a celý beh je v transakcii ukončenej ROLLBACKom, takže v DB nič nezostane.
--
-- Očakávaný výsledok: každý riadok PASS.
-- =============================================================================

begin;

create temp table vysledok (poradie int, test text, stav text);

-- ---------------------------------------------------------------------------
-- Testovacie prostredie: firma A (útočník) a firma B (obeť).
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, created_at, updated_at)
values ('a0000000-9999-4000-8000-000000000001','00000000-0000-0000-0000-000000000000',
        'authenticated','authenticated','rls-test-a@example.invalid','x', now(), now());

insert into tenants (id, name) values
  ('a0000000-0000-4000-8000-000000000001','TEST Firma A'),
  ('b0000000-0000-4000-8000-000000000002','TEST Firma B');

insert into locations (id, tenant_id, name) values
  ('a0000000-1111-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001','A-prevadzka'),
  ('b0000000-1111-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','B-prevadzka');

insert into device_types (id, tenant_id, code, name) values
  ('a0000000-2222-4000-8000-000000000001', null, 'test_typ_rls', 'Testovaci typ');

insert into devices (id, tenant_id, location_id, device_type_id, name) values
  ('a0000000-3333-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'a0000000-1111-4000-8000-000000000001','a0000000-2222-4000-8000-000000000001','A-chladnicka'),
  ('b0000000-3333-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002',
   'b0000000-1111-4000-8000-000000000002','a0000000-2222-4000-8000-000000000001','B-chladnicka');

insert into memberships (id, tenant_id, user_id, role, display_name, pin_hash, active) values
  ('a0000000-4444-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'a0000000-9999-4000-8000-000000000001','tenant_admin','A-admin', null, true),
  ('b0000000-4444-4000-8000-00000000000e','b0000000-0000-4000-8000-000000000002',
   null,'employee','B-kuchar','$2a$10$nepouzitelnyhashnatest', true);

insert into kiosk_devices (id, tenant_id, location_id, name, pairing_code, pin_hash) values
  ('a0000000-6666-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',
   'a0000000-1111-4000-8000-000000000001','A-tablet','TESTAA','$2a$10$hashA'),
  ('b0000000-6666-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002',
   'b0000000-1111-4000-8000-000000000002','B-tablet','TESTBB','$2a$10$hashB');

insert into pin_attempts (tenant_id, membership_id, succeeded) values
  ('b0000000-0000-4000-8000-000000000002','b0000000-4444-4000-8000-00000000000e', false);

insert into rules (id, device_type_id, min_c, max_c, valid_from) values
  ('a0000000-5555-4000-8000-000000000001','a0000000-2222-4000-8000-000000000001', 0, 5, '2020-01-01');

grant all on vysledok to authenticated;

-- ---------------------------------------------------------------------------
-- Vžijeme sa do admina firmy A.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-9999-4000-8000-000000000001","tenant_id":"a0000000-0000-4000-8000-000000000001","app_role":"tenant_admin"}';

-- (1) Globálne pravidlá sú legislatíva — cez API ich nesmie meniť nikto,
--     inak by admin jednej firmy prepísal limit platný pre všetky ostatné.
do $$ begin
  update rules set max_c = 999 where id='a0000000-5555-4000-8000-000000000001';
  insert into vysledok values (1,'globalne pravidlo sa neda prepisat','FAIL — update presiel');
exception when insufficient_privilege then
  insert into vysledok values (1,'globalne pravidlo sa neda prepisat','PASS');
end $$;

do $$ begin
  delete from rules where id='a0000000-5555-4000-8000-000000000001';
  insert into vysledok values (2,'globalne pravidlo sa neda zmazat','FAIL — delete presiel');
exception when insufficient_privilege then
  insert into vysledok values (2,'globalne pravidlo sa neda zmazat','PASS');
end $$;

-- (2) Rozvrh musí ukazovať na zariadenie vlastnej firmy.
do $$ begin
  insert into schedules (tenant_id, device_id, due_time, tolerance_min)
  values ('a0000000-0000-4000-8000-000000000001','b0000000-3333-4000-8000-000000000002','08:00', 60);
  insert into vysledok values (3,'rozvrh na cudzie zariadenie','FAIL — insert presiel');
exception when insufficient_privilege then
  insert into vysledok values (3,'rozvrh na cudzie zariadenie','PASS');
end $$;

-- (3) Meranie vzniká iba pri zariadení cez kiosk (service role), nie
--     z prihlásenej administrácie — inak by sa dal denník doplniť bez PIN-u.
do $$ begin
  insert into measurements (tenant_id, location_id, device_id, membership_id, value_c, status)
  values ('a0000000-0000-4000-8000-000000000001','a0000000-1111-4000-8000-000000000001',
          'a0000000-3333-4000-8000-000000000001','a0000000-4444-4000-8000-000000000001', 4, 'ok');
  insert into vysledok values (4,'admin nezapise meranie mimo kiosku','FAIL — insert presiel');
exception when insufficient_privilege then
  insert into vysledok values (4,'admin nezapise meranie mimo kiosku','PASS');
end $$;

-- (4) Nulovanie počítadla PIN pokusov len pre vlastnú firmu — inak by sa
--     dala obísť ochrana proti hádaniu PIN-u cudzieho pracovníka.
do $$ begin
  perform pin_clear_attempts('b0000000-4444-4000-8000-00000000000e');
  insert into vysledok values (5,'reset PIN pokusov cudzej firme','FAIL — presiel');
exception when others then
  insert into vysledok values (5,'reset PIN pokusov cudzej firme','PASS');
end $$;

-- ---------------------------------------------------------------------------
-- Kontrola, že legitímne operácie ostali funkčné (fix nesmie rozbiť produkt).
-- ---------------------------------------------------------------------------

do $$ begin
  insert into schedules (tenant_id, device_id, due_time, tolerance_min)
  values ('a0000000-0000-4000-8000-000000000001','a0000000-3333-4000-8000-000000000001','08:00', 60);
  insert into vysledok values (6,'rozvrh na vlastne zariadenie funguje','PASS');
exception when others then
  insert into vysledok values (6,'rozvrh na vlastne zariadenie funguje','FAIL — '||sqlerrm);
end $$;

do $$ begin
  perform pin_clear_attempts('b0000000-4444-4000-8000-00000000000e');
exception when others then null;
end $$;

do $$
declare v int;
begin
  select count(*) into v from rules where id='a0000000-5555-4000-8000-000000000001';
  insert into vysledok values (7,'citanie pravidiel funguje', case when v=1 then 'PASS' else 'FAIL' end);
end $$;

-- (6) Tablet cudzej firmy: PIN je jediná prekážka pred jej kuchyňou.
do $$
declare n int;
begin
  update kiosk_devices set pin_hash = '$2a$10$utocnikov'
   where id = 'b0000000-6666-4000-8000-000000000002';
  get diagnostics n = row_count;
  insert into vysledok values (9,'nastavenie PIN cudziemu tabletu',
    case when n = 0 then 'PASS' else 'FAIL — prepisal' end);

  update kiosk_devices set device_token_hash = null
   where id = 'b0000000-6666-4000-8000-000000000002';
  get diagnostics n = row_count;
  insert into vysledok values (10,'odhlasenie cudzieho tabletu',
    case when n = 0 then 'PASS' else 'FAIL — odhlasil' end);

  update kiosk_devices set pin_hash = '$2a$10$novyA'
   where id = 'a0000000-6666-4000-8000-000000000001';
  get diagnostics n = row_count;
  insert into vysledok values (11,'sprava vlastneho tabletu funguje',
    case when n = 1 then 'PASS' else 'FAIL' end);
exception when others then
  insert into vysledok values (11,'sprava tabletov','FAIL — '||sqlerrm);
end $$;

-- (7) PIN prevádzky nesmie byť čitateľný cez API ani pre vlastného admina.
do $$ begin
  perform pin_hash from kiosk_devices where id = 'a0000000-6666-4000-8000-000000000001';
  insert into vysledok values (12,'citanie pin_hash cez API','FAIL — precital');
exception when insufficient_privilege then
  insert into vysledok values (12,'citanie pin_hash cez API','PASS');
end $$;

do $$ begin
  perform device_token_hash from kiosk_devices where id = 'a0000000-6666-4000-8000-000000000001';
  insert into vysledok values (13,'citanie device tokenu cez API','FAIL — precital');
exception when insufficient_privilege then
  insert into vysledok values (13,'citanie device tokenu cez API','PASS');
end $$;

reset role;

-- Kiosk (service role) musí naďalej zapísať meranie a server mu prepočíta
-- status — klientom poslaný 'ok' pri 12,5 °C nad limitom 5 °C neplatí.
insert into measurements (tenant_id, location_id, device_id, membership_id, value_c, status)
values ('b0000000-0000-4000-8000-000000000002','b0000000-1111-4000-8000-000000000002',
        'b0000000-3333-4000-8000-000000000002','b0000000-4444-4000-8000-00000000000e', 12.5, 'ok');

insert into vysledok
  select 8, 'kiosk zapise meranie a server prepocita status',
         case when status = 'alarm' then 'PASS' else 'FAIL — status='||status end
    from measurements where device_id='b0000000-3333-4000-8000-000000000002';

select test, stav from vysledok order by poradie;

rollback;
