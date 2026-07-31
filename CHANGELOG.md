# CHANGELOG

Formát podľa [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.4.0] — 2026-07-31

### Bezpečnosť

- **Rate limiting na overovanie PIN** (migrácia `0008`). 4-miestny PIN má
  10 000 kombinácií a doteraz sa dal skúšať donekonečna. Nové hranice:
  5 neúspechov / 15 min na zamestnanca a 20 / 15 min na kiosk (druhá bráni
  prechádzaniu všetkých zamestnancov na jednom tablete). Okno je klzavé,
  takže sa účet sám odomkne — kuchár nečaká na admina. Úspešné zadanie
  sériu vynuluje. Počítadlo je v DB, pretože serverless inštancie nezdieľajú
  pamäť. Overené testom všetkých hraníc (4 pokusy prejdú, 5. zamkne na
  900 s, úspech vynuluje).
- Reset PIN adminom účet zároveň odomkne — inak by zamestnanec čakal na
  vypršanie okna aj s novým PIN-om.
- `pin_attempts` je zámerne bez audit triggera; pokusy o PIN by inak
  zaplavili `audit_log`. Tabuľka je neprístupná pre `anon` aj
  `authenticated` (RLS bez policy), zapisuje len service role.

### Pridané

- **Automatizovaný test izolácie tenantov**
  (`supabase/tests/rls_isolation_test.sql`). Overuje reálnym dotazom cez
  rolu `authenticated`, že admin jednej prevádzky nevidí zariadenia,
  zamestnancov ani prevádzky inej, a že neznámy používateľ nedostane nič.
  Beží v transakcii ukončenej ROLLBACKom — overené, že v DB ani v
  `audit_log` nezostane žiadny testovací záznam.
- **Prístupnosť kiosku**: výsledok merania sa ohlasuje cez `aria-live`,
  chyby cez `role="alert"`, klávesy majú popisy a celý flow sa dá ovládať
  fyzickou klávesnicou (číslice, Backspace, Enter, Escape, `-` a `,`).

## [0.3.0] — 2026-07-20

### Opravené

- **Kritické: administrácia nefungovala bez JWT hooku.** Tenant a rola sa
  čítali výhradne z JWT claims, ktoré napĺňa `custom_access_token_hook`. Ak
  hook nebol aktivovaný v Supabase Dashboarde alebo mal používateľ token
  vydaný pred jeho aktiváciou, RLS nepustila admina k žiadnym dátam a celá
  administrácia hlásila „chýba tenant". Resolúcia je odteraz dvojstupňová
  (`current_tenant_id()`): claim z JWT → fallback lookup `memberships` podľa
  `auth.uid()`. Hook je optimalizácia, nie podmienka funkčnosti.
  (migrácia `0005`)
- **Dashboard pároval merania k zariadeniam podľa názvu.** Dve zariadenia
  s rovnakým názvom si navzájom prepisovali stav v prehľade „dnes odmerať".
  Párovanie ide teraz cez `device_id`.
- Zavádzajúca hláška „skontroluj JWT hook" nahradená presnou („účet nemá
  priradenú prevádzku"), keďže príčina je odteraz iná.

### Pridané

- **Export meraní do CSV** za zvolené obdobie vrátane nápravných opatrení.
  BOM a bodkočiarkový oddeľovač, aby slovenský Excel správne zobrazil
  diakritiku a čísla.
- **Nápravné opatrenia k alarmom** — formulár priamo pri každom alarme,
  počítadlo alarmov bez opatrenia. Append-only a auditované rovnako ako
  merania. (migrácia `0007`)
- **Globálny error boundary** — server chyba už nekončí bielou stránkou
  s „Application error", ale zrozumiteľnou hláškou s možnosťou opakovania.
- Riadiace dokumenty projektu: `CLAUDE.md`, `TASK.md`, `ROADMAP.md`,
  `DONE.md`, `CHANGELOG.md` a workflow príkazy v `.claude/commands/`.

### Bezpečnosť

- Trigger funkcie `audit_trigger()` a `block_mutation()` už nie sú volateľné
  cez PostgREST RPC. Predchádzajúci revoke minul default grant pre rolu
  `PUBLIC`. (migrácia `0006`)
- `current_tenant_id()` / `current_app_role()` odobrané anonymnej role.
- Overená izolácia: používateľ bez členstva nedostane žiadny tenant ani rolu.

## [0.2.0] — 2026-07-20

### Zmenené

- **Kiosk sa už nepýta PIN po každom meraní.** Predtým operátor s 15
  zariadeniami zadával PIN 15-krát. PIN sa zadáva raz za session, po uložení
  merania sa flow vracia rovno na výber zariadenia. Session sa zamkne po
  5 minútach nečinnosti alebo ručne.
- Výber zariadenia v kiosku ukazuje poslednú hodnotu, čas od posledného
  merania a štítok „dnes odmerať".
- Obrazovka zadávania teploty ukazuje povolený limit a minulú hodnotu.

### Pridané

- Administrácia: správa **zariadení** vrátane vlastných limitov per
  zariadenie (migrácia `0004`), **zamestnancov** vrátane zmeny PIN a
  **kioskov** vrátane generovaných párovacích kódov.
- Navigácia v administrácii (Prehľad · Zariadenia · Zamestnanci · Kiosky).
- Dashboard: sekcia „dnes odmerať" s progresom a stavom každého zariadenia.
- Prázdne stavy s návodom, kam ísť ďalej.

## [0.1.0] — 2026-07-06

### Pridané

- Multi-tenant schéma s RLS izoláciou, audit log, verzované legislatívne
  limity (migrácie `0001`, `0002`).
- Append-only merania vynútené DB triggerom vrátane service role.
- Kiosk: párovanie tabletu jednorazovým kódom, device token v httpOnly
  cookie (v DB iba SHA-256 hash), merací flow meno → PIN → zariadenie →
  teplota.
- Administrácia: prihlásenie, prehľad alarmov a dnešných meraní.
- Nasadenie na Vercel + Supabase (eu-central-1).
