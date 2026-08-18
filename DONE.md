# DONE.md — aktuálny sprint

Odškrtnuté = hotové a overené. Neodškrtnuté = zostáva dokončiť.

## Sprint: bezpečnostný audit pred predajom

Každý nález overený reálnym dotazom pod rolou útočníka pred opravou aj po nej.

- [x] Globálne limity (`rules`) sa nedajú meniť cez API — dovtedy ich mohol
      prepísať aj zmazať admin ktorejkoľvek firmy
- [x] Pozvánka už neprepisuje heslo existujúceho účtu (prevzatie cudzieho konta)
- [x] PIN sa overuje aj voči prevádzke, nielen firme
- [x] Limit pokusov na párovanie tabletu a na registráciu firmy
- [x] `pin_clear_attempts` overuje firmu volajúceho
- [x] Rozvrh sa nedá naviazať na zariadenie cudzej firmy
- [x] Merania sa nedajú zapísať mimo kiosku (bez PIN-u pracovníka)
- [x] Neutralizované vzorce v CSV exporte, čísla zostali číslami
- [x] Párovací kód cez `crypto.randomInt`, minimálne 6 znakov
- [x] Zjednotená platnosť pravidla medzi aplikáciou a DB (`valid_to >= dnes`)
- [x] Vyhodnotenie limitu v jednom module namiesto troch kópií
- [x] Prvé testy v projekte: `vitest`, 32 unit testov
- [x] Regresný SQL test izolácie zápisov (8/8 PASS, self-contained)
- [x] `/api/health` vrátane kontroly spojenia s DB
- [x] Indexy na horúce cesty, slovenská 404, zálohovanie v README
- [x] E2E testy (Playwright) — kiosk flow, párovanie, izolácia prevádzok,
      offline fronta, responzivita na mobile
- [x] CI workflow: typecheck, unit testy, build, SQL izolácia, E2E nad
      jednorazovou databázou
- [x] Seed pre lokálny vývoj a testy (`supabase/seed.sql`)
- [x] Podklad pre právnu verifikáciu limitov (`docs/LIMITY-NA-OVERENIE.md`)
- [ ] Zapnúť leaked password protection (Supabase Dashboard, nedá sa z kódu)
- [ ] Právna verifikácia limitov (externý odborník) — podklad je pripravený
- [x] CI zelené: 22/22 E2E testov, 35 unit testov, SQL izolácia 8/8
- [x] Odstránený drift medzi produkciou a migráciami (0020–0023)
- [x] PDF report pre kontrolu vrátane slovenskej diakritiky

## Sprint: anonymita pobočiek a revízia aplikácie

- [x] Zamestnanci viazaní na prevádzky (`membership_locations`)
- [x] Kiosk načítava merania podľa prevádzky, nie firmy
- [x] Vlastný párovací kód pri kiosku
- [x] Nová prevádzka vytvorí aj tablet a vygeneruje kód
- [x] Premenovanie firmy z administrácie
- [x] Oprava pádu administrácie pri chýbajúcej prevádzke
- [x] Oprava stránkovania pri hľadaní účtu v pozvánke
- [x] Odstránenie mŕtveho stĺpca `photo_path`
- [x] Premenovanie produktu a odstránenie zástupných názvov

## Sprint: bezpečnosť a overiteľnosť

- [x] Rate limiting na overovanie PIN (5 pokusov / 15 min per zamestnanec,
      20 per kiosk, klzavé okno) — overené v DB testom všetkých hraníc
- [x] Reset PIN adminom zároveň odomkne zablokovaný účet
- [x] Automatizovaný test izolácie tenantov (`supabase/tests/`) — overené
      reálnym dotazom cez rolu `authenticated`, nie čítaním policies
- [x] Prístupnosť kiosku: `role="alert"` na chybách, `aria-live` na výsledku
      merania, popisy kláves, ovládanie fyzickou klávesnicou
- [x] Merge PR #1 do `main`

## Predchádzajúci sprint: MVP dokončenie

- [x] Oprava kritickej závislosti na JWT hooku (dvojstupňová resolúcia tenanta)
- [x] Zúženie RPC plochy (trigger funkcie nedostupné cez PostgREST)
- [x] Riadiace dokumenty projektu (CLAUDE.md, TASK.md, ROADMAP.md, DONE.md)
- [x] Export meraní do CSV s filtrom obdobia
- [x] Nápravné opatrenia k alarmom
- [x] Oprava párovania meraní podľa `device_id` namiesto názvu
- [x] Globálny error boundary
- [x] Odstránenie duplicitnej kópie projektu (`haccpcomplete/`)

## Hotové v predchádzajúcich iteráciách

- [x] Multi-tenant schéma, RLS, audit log, verzované pravidlá
- [x] Append-only merania vynútené DB triggerom
- [x] Kiosk: párovanie tabletu device tokenom
- [x] Kiosk: meranie meno → PIN → zariadenie → teplota
- [x] Kiosk: PIN raz za session, plynulý prechod na ďalšie zariadenie
- [x] Kiosk: kontext pri meraní (limit, minulá hodnota, čas)
- [x] Admin: prihlásenie + stráženie `/admin` middleware-om
- [x] Admin: prehľad „dnes odmerať", alarmy 7 dní, dnešné merania
- [x] Admin: CRUD zariadení vrátane vlastných limitov
- [x] Admin: CRUD zamestnancov vrátane zmeny PIN
- [x] Admin: CRUD kioskov vrátane párovacích kódov
- [x] Nasadenie na produkciu (Vercel + Supabase eu-central-1)
