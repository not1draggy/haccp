# CLAUDE.md — pravidlá pre prácu na tomto projekte

## Čo to je

Multi-tenant HACCP SaaS pre gastro prevádzky. Kuchyňa zapisuje teploty na
zdieľanom tablete (kiosk), vedúci to sleduje v administrácii. Výstup musí
obstáť pri kontrole (RVPS / hygiena), takže **dôveryhodnosť dát je nadradená
pohodliu**.

Stack: Next.js 15 (App Router, server actions) · TypeScript · Tailwind ·
Supabase (Postgres + Auth) · Vercel.

## Invarianty — nikdy neporušiť

1. **Merania sú append-only.** `measurements` nesmie mať UPDATE ani DELETE —
   ani cez service role. Opravou chybného merania je nové meranie, nie edit.
   Vynútené DB triggerom `block_mutation`, nie iba aplikačnou logikou.
2. **Vyhodnotenie limitu patrí na server.** Klient nikdy neposiela `status`
   ani limity — počíta ich server action z DB. Klientovi sa dá veriť len
   nameraná hodnota.
3. **Kiosk nikdy neposiela `tenant_id`.** Tenant a prevádzka sa odvodzujú
   výhradne z device tokenu (`getKioskSession()`). Kiosk actions bežia so
   service role, takže scoping je jediná ochrana — musí byť explicitný
   v každom dotaze.
4. **PIN sa overuje pri každom zápise**, nie len pri prihlásení do kiosk
   session. Odomknutý tablet nesmie stačiť na zápis pod cudzím menom.
5. **Service role klient sa nikdy nedostane do klientskeho bundlu.** Súbor
   `src/lib/supabase/service.ts` má `import 'server-only'` — nechať tam.
6. **Konfiguračné entity sa nemažú, deaktivujú sa** (`active = false`).
   Zmazanie zariadenia by osirotelo históriu meraní a rozbilo audit.
7. **Každá mutácia governed tabuliek ide do `audit_log`**, do ktorého sa nedá
   priamo zapisovať ani ho meniť.

## Architektonické rozhodnutia

- **Dva svety autentifikácie.** Admin = Supabase Auth session + RLS. Kuchyňa =
  žiadne osobné sessions, tablet drží device token (httpOnly cookie, v DB iba
  SHA-256 hash), PIN slúži na identifikáciu pracovníka pre audit.
- **Resolúcia tenanta je dvojstupňová** (`current_tenant_id()`): claim z JWT →
  fallback lookup `memberships` podľa `auth.uid()`. JWT hook je optimalizácia,
  **nie podmienka funkčnosti**. Nikdy sa nevracaj k závislosti na jednom
  prepínači v Dashboarde.
- **Limity sú verzované** (`rules.valid_from/valid_to`). Meranie si drží FK na
  verziu, podľa ktorej bolo vyhodnotené — zmena legislatívy nesmie spätne
  prepísať históriu. Vlastný limit zariadenia (`devices.min_c/max_c`) má
  prednosť pred globálnym pravidlom.

## Konvencie kódu

- UI texty **po slovensky**, kód a komentáre po slovensky, identifikátory
  anglicky (`createDevice`, `measuredToday`).
- Komentár píš iba tam, kde kód sám nepovie **prečo** — nie čo robí ďalší
  riadok.
- Validácia vstupov server actions cez `zod`, vždy `safeParse`.
- Server components ako default; `'use client'` len tam, kde je naozaj stav.
- Tailwind paleta: `ink`, `steel`, `frost`, `ok`, `warn`, `danger`. Nepridávaj
  ďalšie akcentové farby.
- Prechody 150–250 ms. Žiadne zbytočné potvrdzovacie dialógy.

## Pred commitom

```bash
npm run typecheck
npm run build
```

Obe musia prejsť. Po zmene schémy spusti `get_advisors` (security aj
performance) a nálezy buď oprav, alebo zapíš do ROADMAP.md s odôvodnením.

## Čo NEROBIŤ

- Nepridávať `UPDATE`/`DELETE` policy na `measurements`.
- Neposielať limity ani `status` z klienta.
- Nemazať zariadenia/zamestnancov/kiosky.
- Nezavádzať závislosť na manuálnom kroku v Dashboarde bez fallbacku.
- Nepridávať PIN prompt do priebehu merania — prerušuje workflow operátora.
