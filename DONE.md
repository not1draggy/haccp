# DONE.md — aktuálny sprint

Odškrtnuté = hotové a overené. Neodškrtnuté = zostáva dokončiť.

## Sprint: MVP dokončenie

- [x] Oprava kritickej závislosti na JWT hooku (dvojstupňová resolúcia tenanta)
- [x] Zúženie RPC plochy (trigger funkcie nedostupné cez PostgREST)
- [x] Riadiace dokumenty projektu (CLAUDE.md, TASK.md, ROADMAP.md, DONE.md)
- [x] Export meraní do CSV s filtrom obdobia
- [x] Nápravné opatrenia k alarmom
- [x] Oprava párovania meraní podľa `device_id` namiesto názvu
- [x] Globálny error boundary

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
