# CHANGELOG

Formát podľa [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.8.0] — 2026-08-27

### Zmenené — vstup do kiosku

- **Kiosk sa otváral sám do naposledy použitej prevádzky.** Nebolo to
  zadrátované v kóde — žiadny názov prevádzky v ňom nie je — ale device token
  v cookie platil rok a nič ho neoveroval. Kto sa raz dostal k tabletu alebo
  ku kódu, mal prevádzku otvorenú natrvalo.

  Vstup je odteraz **kód prevádzky + PIN** (`0025`). PIN je bcrypt hash na
  `kiosk_devices`, session platí 12 hodín a **platnosť sa kontroluje na
  serveri**, nie cez `maxAge` cookie — tú drží prehliadač a ukradnutý token by
  sa dal prehrať aj po vypršaní. Odhlásenie zneplatní token aj v databáze.

- **Neutrálna hláška.** „Nesprávny kód prevádzky alebo PIN." nerozlišuje, či
  bol zlý kód alebo PIN, a porovnanie hashu prebehne aj pri neznámom kóde —
  inak by sa zoznam prevádzok dal zistiť hádaním kódov alebo meraním času
  odpovede. Limit pokusov (10 / 15 min per IP) zostal.

- **`pin_hash` ani `device_token_hash` už nie sú čitateľné cez API** ani pre
  prihláseného admina. Column-level REVOKE je pri table-level grante bez
  účinku, preto sa právo odoberá celé a vracia výpočtom stĺpcov — nový stĺpec
  tejto tabuľky tým nebude čitateľný automaticky. Administrácia vidí iba
  odvodené `pin_set`.

- **Migrácia zámerne žiadny PIN nevymýšľa.** Vygenerovaný PIN by nikto
  nepoznal a kuchyňu by to zablokovalo bez vysvetlenia. Existujúce tablety
  majú `pin_hash = NULL`, prihlásenie sa odmietne a administrácia ich označí
  výstrahou „PIN nie je nastavený".

- UI zostalo nezmenené: domovská obrazovka je rovnaká, prihlásenie používa ten
  istý vizuálny jazyk ako pôvodné párovanie, pribudlo jedno pole.

## [0.7.0] — 2026-08-18

### Pridané

- **E2E testy (Playwright)** — kiosk flow je jediná cesta, ktorou v produkte
  vzniká meranie, a doteraz ho neoverovalo nič automatické. Testy pokrývajú
  celý flow (párovanie → pracovník → PIN → zariadenie → hodnota), serverové
  vyhodnotenie limitu, izoláciu prevádzok priamo v prehliadači, výpadok
  pripojenia a responzivitu na mobile. Kiosk beží v tabletovom viewporte —
  testovať ho na desktope by minulo presne tie chyby, čo sa prejavia
  v kuchyni.
- **CI workflow** — typecheck, unit testy, build, SQL testy izolácie a E2E nad
  jednorazovou databázou. FAIL v SQL testoch zhodí build (PASS/FAIL sú v tom
  skripte dáta, nie chyby SQL, takže bez explicitnej kontroly by regresia
  prešla ako úspech).
- **Seed pre lokálny vývoj** (`supabase/seed.sql`) s druhou prevádzkou
  navyše — testy na nej overujú, že sa jej zamestnanci ani zariadenia na
  tablete prvej prevádzky neobjavia.
- **Podklad pre právnu verifikáciu limitov** (`docs/LIMITY-NA-OVERENIE.md`)
  — tabuľka všetkých limitov s návrhmi zdrojov na overenie, zreteľne
  označenými ako neoverené, plus postup zápisu výsledku.

### Opravené — drift medzi produkciou a migráciami

Prvý ostrý beh E2E odhalil, že schéma v migráciách nezodpovedala produkcii.
Každý z týchto nálezov by sa naplno prejavil až pri obnove zálohy do nového
projektu — teda presne vtedy, keď na tom najviac záleží.

- **Trigger `measurements_resolve` a funkcia `effective_limits` neboli
  v žiadnej migrácii** (`0021`). Práve ony presadzujú invariant, na ktorom
  stojí dôveryhodnosť denníka: status a limity počíta server, klientovi sa
  verí len nameraná hodnota. V čistej databáze prešlo meranie 12,5 °C
  v chladničke s limitom 0–5 °C so stavom `ok`, ktorý poslal klient —
  a aplikácia pritom vyzerala, že funguje správne.
- **Stĺpce `measurements.min_c_applied` a `max_c_applied` chýbali** (`0022`).
  Zapisuje do nich ten istý trigger, takže bez nich zlyhal každý zápis
  merania. Držia limit platný v čase merania: vlastný limit zariadenia nie je
  verzovaný, takže bez nich by sa spätne nedalo doložiť, prečo bol starý
  záznam vyhodnotený ako alarm.
- **Schéma sa spoliehala na to, že Supabase pridelí API rolám práva sama**
  (`0020`). Na hostovanom projekte to platí, v čistej databáze nie —
  `service_role` tam nedostal ani SELECT.
- **Zmazané mŕtve `set_pin` a `verify_pin`** (`0023`). Aplikácia ich nevolá
  (PIN rieši `bcryptjs` v Node), ale `verify_pin` overovala PIN bez zápisu do
  `pin_attempts`, teda obchádzala ochranu proti hádaniu PIN-u z `0008`.

Kompletná kontrola: porovnané všetky tabuľky, stĺpce a funkcie produkcie proti
migráciám; okrem vyššie uvedeného drift nie je. Všetky štyri migrácie sú
v produkcii no-op (overené odtlačkom práv a existenciou objektov).

### Opravené — revízia vlastnej práce

Po zazelenaní CI som prešiel celú vetvu ešte raz. Tri nálezy, všetky
v kóde, ktorý pribudol v tomto sprinte:

- **Limit registrácie nelimitoval nič.** `rate_limit_locked_seconds` počítala
  iba NEÚSPEŠNÉ pokusy. Pri párovaní tabletu je to správne (zneužitím je
  hádanie kódu), pri registrácii firmy je to však presne naopak — zneužitím
  JE úspech. Skript, ktorému každý pokus vyšiel, nezapísal ani jeden neúspech,
  takže počítadlo zostávalo na nule. Overené na produkcii: 20 úspešných
  registrácií z jednej IP vrátilo `locked_seconds = 0`. Opravené v `0024`,
  regresný test je v `supabase/tests/rate_limit_test.sql` a beží v CI.
- **Limit sa dal obísť podvrhnutou hlavičkou.** IP sa brala z ľavého konca
  `x-forwarded-for`, ktorý pochádza od klienta — stačilo si pri každom pokuse
  vymyslieť inú. Teraz sa uprednostňujú hlavičky, ktoré klient neovplyvní,
  a z `x-forwarded-for` sa berie pravý koniec.
- **„Dnešok" sa počítal v UTC.** Zobrazovanie už `Europe/Bratislava`
  používalo, ale hranice dňa nie. Meranie o 00:30 miestneho času tak spadlo do
  predošlého dňa a report za august začínal až o 02:00 prvého augusta —
  merania z nočnej zmeny do neho nevošli. Pri zázname, ktorý má obstáť pri
  kontrole, je „ktorý deň to bolo" súčasť dôkazu. Zjednotené v
  `src/lib/haccp/cas.ts` vrátane letného aj zimného času.

### Overenie

CI zelené: 22/22 E2E testov (kiosk flow, párovanie, serverové vyhodnotenie
limitu, izolácia prevádzok, offline fronta, verejné stránky, responzivita),
35 unit testov, SQL testy izolácie 8/8, typecheck aj build.

## [0.6.0] — 2026-08-12

Bezpečnostný audit celej aplikácie. Každý nález nižšie bol pred opravou
overený reálnym dotazom pod rolou útočníka; regresné testy sú v
`supabase/tests/write_isolation_test.sql` (8/8 PASS).

### Bezpečnosť — kritické

- **Admin ktorejkoľvek firmy mohol prepísať a zmazať globálne limity**
  (migrácia `0016`). Tabuľka `rules` je spoločná pre celú platformu a drží
  hodnoty, podľa ktorých sa vyhodnocuje meranie každého zákazníka; policy
  však vyžadovala iba rolu `tenant_admin`, bez akéhokoľvek scopingu. Overené:
  UPDATE aj DELETE prešli. Následok by bol tichý — meranie by sa naďalej
  zapisovalo, len podľa podvrhnutého limitu, takže presne to, čo má denník
  pri kontrole dokazovať, by prestalo platiť. Limity sú legislatíva, nie
  zákaznícke nastavenie: cez API ich už nemení nikto, menia sa migráciou.
- **Pozvánka sa dala použiť na prevzatie cudzieho účtu.** `acceptInvitation`
  prepisovalo heslo, ak účet s daným emailom už existoval. Email pozvánky si
  volí pozývajúci admin, takže stačilo pozvať adresu admina inej firmy,
  odkaz si otvoriť a nastaviť mu heslo. Pozvánka odteraz udeľuje prístup
  k firme, ale nikdy nemení prihlasovacie údaje; majiteľ existujúceho účtu
  sa prihlási svojím heslom.

### Bezpečnosť — vysoké

- **PIN sa neoveroval voči prevádzke.** Zoznam mien na tablete filtrovaný bol,
  zápis nie — `membershipId` chodí od klienta, takže tablet pobočky A sa vedel
  podpísať pod meranie menom pracovníka pobočky B.
- **Párovanie tabletu nemalo limit pokusov** (`0017`). Kód je jediná prekážka
  medzi útočníkom a prevádzkou a úspešné uhádnutie navyše odpojí tablet
  v kuchyni, takže meranie ticho prestane fungovať. Limit je per IP, ukladá
  sa iba SHA-256 hash IP. Minimálna dĺžka vlastného kódu zvýšená na 6 znakov.
- **Registrácia firmy bola verejný endpoint bez limitu** (`0018`) — skriptom
  sa dal vyrobiť ľubovoľný počet firiem aj auth účtov.
- **Rozvrh sa dal naviazať na zariadenie cudzej firmy** (`0016`).
- **`pin_clear_attempts` neoverovala firmu** (`0018`) — admin vedel nulovať
  počítadlo neúspešných PIN-ov cudzej firme a tým obísť ochranu proti
  hádaniu PIN-u.
- **Merania sa dali zapísať aj z administrácie** (`0016`). Aplikácia tak
  merania nikdy nezapisovala (jediná cesta je kiosk cez service role), takže
  policy bola len útočná plocha: umožňovala doplniť denník bez PIN-u
  pracovníka. Meranie má vzniknúť pri zariadení, nie v kancelárii.
- **Vzorce v CSV exporte.** Názvy zariadení a texty opatrení píše používateľ;
  bunka začínajúca `=`, `+`, `-` alebo `@` sa v Exceli vyhodnotí ako vzorec
  a spustí sa na počítači toho, kto export otvorí — spravidla vedúceho alebo
  kontrolóra. Záporné teploty zostávajú číslami.
- Párovací kód sa generoval cez `Math.random()`, ktorý na bezpečnostný token
  nie je určený. Nahradené `crypto.randomInt`.

### Opravené

- **Limit sa v deň zmeny pravidla vyhodnocoval rozdielne v aplikácii a v DB.**
  Aplikácia brala pravidlo ako platné do `valid_to > dnes`, databáza do
  `valid_to >= dnes`. V deň prechodu na nový limit tak tablet mohol ukazovať
  iný stav, než aký sa zapísal do denníka.
- Vyhodnotenie limitu existovalo v troch kópiách (kiosk zápis, kiosk
  vykreslenie, DB trigger). Zjednotené do `src/lib/haccp/limits.ts` krytého
  testami; autoritatívny zostáva DB trigger.
- 404 stránka po slovensky — Next.js dovtedy ukazoval vlastnú anglickú hlášku.

### Pridané

- **Testy.** Projekt dovtedy nemal žiadny test runner. Pribudol `vitest`
  a 32 unit testov na vyhodnotenie limitov a CSV export, plus SQL regresný
  test izolácie zápisov.
- **`/api/health`** — overuje aj spojenie s databázou, nielen že proces beží.
  Bez detailov o chybe v odpovedi, tie zostávajú v logu servera.
- Indexy na cesty, ktoré rastú s prevádzkou (`0019`), predovšetkým
  `memberships.user_id` — ním hľadá `current_tenant_id()` členstvo pri každej
  kontrole RLS bez JWT claimu.
- Zálohovanie, obnova a postup overenia po nasadení v `README.md`.

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
