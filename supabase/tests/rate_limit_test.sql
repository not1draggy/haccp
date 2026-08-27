-- =============================================================================
-- Test limitov pokusov na verejné endpointy
--
-- Regresný test nálezu z revízie: limit registrácie počítal iba NEÚSPEŠNÉ
-- pokusy, takže skript, ktorému každý pokus vyšiel, nezapísal ani jeden
-- neúspech a limit nezabránil ničomu. Overené na produkcii: 20 úspešných
-- registrácií z jednej IP vrátilo `locked_seconds = 0`.
--
-- Obe scope majú zámerne opačné pravidlo a test stráži oboje:
--   signup  — zneužitím je ÚSPECH, počítajú sa všetky pokusy
--   pairing — zneužitím je hádanie kódu, počítajú sa iba neúspechy
--             (personál sa pri opisovaní kódu z papiera občas preklepne)
--
-- SPUSTENIE: skopíruj do SQL Editora a spusti naraz. Beží v transakcii
-- ukončenej ROLLBACKom, v DB po ňom nič nezostane.
--
-- Očakávaný výsledok: každý riadok PASS.
-- =============================================================================

begin;

create temp table vysledok (poradie int, test text, stav text);

-- (1) Registrácia: úspešné pokusy sa musia počítať, inak limit nechráni nič.
insert into public.rate_limit_attempts (scope, ip_hash, succeeded)
select 'signup', 'test-uspech', true from generate_series(1, 5);
insert into vysledok select 1, 'registracia: 5 uspesnych zablokuje',
  case when public.rate_limit_locked_seconds('signup','test-uspech') > 0
       then 'PASS' else 'FAIL' end;

-- (2) Tesne pod limitom musí legitímna registrácia prejsť.
insert into public.rate_limit_attempts (scope, ip_hash, succeeded)
select 'signup', 'test-styri', true from generate_series(1, 4);
insert into vysledok select 2, 'registracia: 4 uspesne este prejdu',
  case when public.rate_limit_locked_seconds('signup','test-styri') = 0
       then 'PASS' else 'FAIL' end;

-- (3) Párovanie: úspešné spárovanie je bežná prevádzka, nesmie zapĺňať limit.
insert into public.rate_limit_attempts (scope, ip_hash, succeeded)
select 'pairing', 'test-parovanie-ok', true from generate_series(1, 15);
insert into vysledok select 3, 'parovanie: 15 uspesnych netrestame',
  case when public.rate_limit_locked_seconds('pairing','test-parovanie-ok') = 0
       then 'PASS' else 'FAIL' end;

-- (4) Párovanie: hádanie kódu sa musí zablokovať.
insert into public.rate_limit_attempts (scope, ip_hash, succeeded)
select 'pairing', 'test-hadanie', false from generate_series(1, 10);
insert into vysledok select 4, 'parovanie: 10 neuspechov zablokuje',
  case when public.rate_limit_locked_seconds('pairing','test-hadanie') > 0
       then 'PASS' else 'FAIL' end;

-- (5) Okno sa posúva — staré pokusy nesmú blokovať navždy.
insert into public.rate_limit_attempts (scope, ip_hash, succeeded, attempted_at)
select 'signup', 'test-stare', true, now() - interval '2 hours' from generate_series(1, 10);
insert into vysledok select 5, 'registracia: pokusy spred 2 hodin uz neblokuju',
  case when public.rate_limit_locked_seconds('signup','test-stare') = 0
       then 'PASS' else 'FAIL' end;

-- (6) Limit je per IP — cudzí útočník nesmie zamknúť poctivého zákazníka.
insert into vysledok select 6, 'limit plati per IP, nie globalne',
  case when public.rate_limit_locked_seconds('signup','test-ina-ip') = 0
       then 'PASS' else 'FAIL' end;

select test, stav from vysledok order by poradie;

rollback;
