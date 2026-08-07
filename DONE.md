# DONE.md — aktuálny sprint

Odškrtnuté = hotové a overené. Neodškrtnuté = zostáva dokončiť.

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
