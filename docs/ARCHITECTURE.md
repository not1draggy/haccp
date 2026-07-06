# Architektúra

Cloudový multi-tenant HACCP systém pre gastro prevádzky. Tento dokument
vysvetľuje kľúčové rozhodnutia; postup nasadenia je v `README.md`.

## Stack a prečo

| Vrstva | Voľba | Dôvod |
| --- | --- | --- |
| Frontend + API | Next.js 15 (App Router, server actions) | Jedna kódová báza pre kiosk aj admin; server actions eliminujú vlastné REST API. |
| DB + Auth | Supabase (Postgres + GoTrue) | RLS priamo v Postgrese, hotová správa používateľov, EU región. |
| Hosting | Vercel | Deploy z gitu, zero-ops. |
| Styling | Tailwind | Rýchle iterácie, dark kiosk UI aj svetlý admin z jednej palety. |

## Multi-tenancy

Jedna databáza, izolácia cez **Row Level Security** podľa `tenant_id`.
Tenant má prevádzky (`locations`), členov (`memberships`), zariadenia
(`devices`), kiosky (`kiosk_devices`) a merania (`measurements`).

`tenant_id` sa do JWT dostáva cez **custom access token hook**
(`public.custom_access_token_hook`) — pri vydávaní tokenu sa doplní
`tenant_id` a `app_role` z tabuľky `memberships`. RLS policies potom čítajú
claims cez helpery `jwt_tenant_id()` / `jwt_app_role()`. Hook treba po
migrácii manuálne aktivovať v Supabase Dashboarde (viď README) — bez neho
admin neuvidí žiadne dáta, čo je bezpečný default (fail closed).

## Dva svety autentifikácie

### Admin (kancelária)

Klasická Supabase Auth session (email + heslo), cookies spravuje
`@supabase/ssr`, middleware obnovuje session a stráži `/admin`. Všetky
admin dopyty idú pod anon kľúčom → RLS rozhoduje, čo admin vidí.

### Kuchyňa (kiosk)

Kuchyňa nemá osobné sessions — tablet je zdieľaný a personál sa strieda.
Model:

1. Admin vytvorí `kiosk_devices` záznam s jednorazovým `pairing_code`.
2. Tablet na `/kiosk` zadá kód → server vygeneruje náhodný 256-bit token,
   do DB uloží jeho **SHA-256 hash**, tablet dostane token v **httpOnly
   cookie** (JS k nemu nemá prístup). Re-pair zneplatní starý tablet.
3. Každá kiosk operácia je server action bežiaca so **service role**;
   tenant a prevádzka sa odvodzujú **výhradne** z device tokenu
   (`getKioskSession()`), nikdy z klientskych vstupov.
4. **PIN** (bcrypt hash v `memberships.pin_hash`) neautentifikuje session —
   identifikuje pracovníka pre audit záznam. Overuje sa znovu pri samotnom
   zápise merania, nielen v UI kroku.

Cieľ UX: meno → PIN → zariadenie → teplota, celé pod 10 sekúnd, veľké
dotykové plochy, tmavé UI, automatický reset na úvod.

## Merania: append-only

`measurements` je žurnál — kontrolór musí veriť, že história sa nedá
prepísať:

- `before update or delete` trigger (`block_mutation`) vyhodí výnimku pre
  **všetky** roly vrátane service role,
- klientskym rolám sú navyše odobraté `UPDATE`/`DELETE` grants,
- `INSERT` policy pre klientov neexistuje — zápis ide len cez service role
  v kiosk server action, ktorá limit vyhodnotí na serveri.

Oprava chybného merania = nové meranie (v ďalšej fáze s poznámkou /
nápravným opatrením), nie edit.

## Verzované legislatívne pravidlá

Limity (`rules`) sú viazané na typ zariadenia a **verzované cez
`valid_from`/`valid_to`** — zmena legislatívy znamená uzavrieť starý riadok
a vložiť nový. Meranie si ukladá FK na konkrétnu verziu pravidla, podľa
ktorej bolo vyhodnotené, takže spätná zmena limitov nemení históriu ani
vyhodnotenie starých meraní. `legal_ref` nesie citáciu predpisu
(⚠ pred predajom vyžaduje právnu verifikáciu).

## Audit

Trigger `audit_trigger` (security definer) zapisuje každú mutáciu governed
tabuliek do `audit_log` (old/new JSONB, aktor z `auth.uid()`). Priamy zápis
do `audit_log` je klientom odobratý a tabuľka je sama append-only. Čítať ju
môže len `tenant_admin` v rámci svojho tenanta.

## Rozvrhy meraní

`schedules` definuje, kedy má byť zariadenie odmerané (`due_time` +
tolerancia). Zatiaľ slúži ako dátový podklad — vyhodnocovanie zmeškaných
meraní cez `pg_cron` je ďalšia fáza (viď README, „Ďalšie fázy").

## Štruktúra kódu

```
src/
  app/
    page.tsx           # rázcestník kiosk / admin
    login/             # admin login (server action)
    admin/             # dashboard: alarmy + dnešné merania (RLS klient)
    kiosk/             # párovanie + merací flow (service role actions)
  lib/
    supabase/server.ts   # SSR klient (anon + session cookie)
    supabase/service.ts  # service role klient ('server-only')
    kiosk/session.ts     # device token: generovanie, hash, cookie, lookup
  middleware.ts          # refresh session, guard /admin
supabase/migrations/     # 0001 core schéma, 0002 schedules + seed
```

## Hranice dôvery (zhrnutie)

| Aktér | Kľúč | Scoping |
| --- | --- | --- |
| Admin prehliadač | anon + session | RLS z JWT claims |
| Kiosk tablet | device token (httpOnly cookie) | server-side lookup hashu → tenant/location |
| Server actions kiosku | service role | explicitný scoping zo session kiosku |
| Audit / append-only | DB triggery | platí pre všetkých vrátane service role |
