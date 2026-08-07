# CHANGELOG

Formát podľa [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.0] — 2026-08-07

### Anonymita medzi pobočkami

- **Zamestnanci sú viazaní na prevádzky** (`membership_locations`, migrácia
  `0012`). Doteraz viseli len na firme, takže tablet v jednej pobočke ponúkal
  mená pracovníkov zo všetkých pobočiek. Väzba je M:N — vedúci alebo záskok
  reálne pokrýva viac prevádzok. Overené: kiosk pobočky A nevidí zamestnanca
  ani zariadenie pobočky B a naopak, vlastných vidí.
- **Kiosk načítaval merania podľa firmy, nie prevádzky.** Okrem úniku to bola
  funkčná chyba: záznamy inej pobočky mohli zaplniť okno 500 riadkov a vlastné
  zariadenie potom vyzeralo, akoby nemalo históriu.
- **Vlastný párovací kód** — admin si ho môže zvoliť podľa pobočky.

### Opravené

- **Chýbajúca prevádzka zhodila celú administráciu.** Filtre používali
  `.eq('location_id', '')`, čo Postgres nevie pretypovať na uuid → 500 na
  každej stránke. Nastalo by to hneď po deaktivovaní jedinej prevádzky.
  Nahradené neexistujúcim UUID, ktoré korektne vráti prázdny výsledok.
- **Vyhľadanie existujúceho účtu pri pozvánke stránkovalo po 50 používateľoch** —
  pri väčšom počte účtov by pozvánka zlyhala bez zjavnej príčiny.
- Odstránený nepoužívaný stĺpec `measurements.photo_path` (migrácia `0014`).
  Nič doň nezapisovalo; pri audite by vyzeralo, že fotky evidujeme.

### Pridané

- **Samoregistrácia firmy** (`/registracia`, migrácia `0015`). Doteraz sa
  nový tenant dal založiť iba ručne cez SQL — každý ďalší zákazník znamenal
  zásah do databázy. Formulár založí naraz účet, firmu, prvú prevádzku, jej
  tablet aj členstvo admina.

  Založenie je **jedna DB funkcia, nie štyri inserty zo server action**:
  ide o štyri závislé zápisy a zlyhanie medzi nimi by nechalo firmu bez
  admina alebo prevádzku bez tabletu — teda účet, s ktorým sa nedá pracovať
  a ktorý sa nedá ani zmazať cez UI. `register_tenant` je preto jedna
  transakcia a je volateľná **výhradne service role** (`revoke ... from
  public, anon, authenticated`) — v momente registrácie ešte neexistuje
  členstvo, takže RLS by zápis neprepustila, a zároveň sa nesmie dať
  zavolať anonymne cez `/rest/v1/rpc`, inak by ktokoľvek vyrábal tenantov.
  Overené: `anon` ani `authenticated` na ňu nemajú `EXECUTE`.

  Jeden účet = jedna firma; opakované odoslanie formulára by inak založilo
  druhého tenanta a používateľ by skončil v tom, ktorý mu `current_tenant_id()`
  vyberie ako prvý. Ak RPC zlyhá, čerstvo vytvorený auth účet sa zmaže, aby
  sa email dal použiť znova. Existujúci email registrácia neprevezme — z
  formulára by sa tak stal nástroj na prepísanie cudzieho hesla.

- **Nová prevádzka vytvorí rovno aj svoj tablet** a vygeneruje párovací kód —
  prevádzka bez tabletu nemá ako merať a druhý krok sa ľahko zabudne.
  Kód je unikátny naprieč platformou, generátor kolíziu overuje.
- **Premenovanie firmy z administrácie** (migrácia `0013`). Doteraz sa dalo
  zmeniť len cez SQL. Overené aj to, že cudzí účet názov zmeniť nedokáže.
- Upozornenie v administrácii, keď firma nemá žiadnu aktívnu prevádzku.
  Zobrazuje sa **nad** obsahom, nie namiesto neho — inak by zakrylo aj
  formulár na stránke Prevádzky, teda jediné miesto, kde sa dá chýbajúca
  prevádzka vytvoriť.

### Zmenené

- Produkt sa volá **Digitálny HACCP denník**; zástupné názvy typu
  „Reštaurácia U Janka" nahradené neutrálnymi v dokumentácii aj v dátach.

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
