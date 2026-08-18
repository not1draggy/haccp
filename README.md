# Digitálny HACCP denník

Evidencia teplôt pre gastro prevádzky, ktorá obstojí pri kontrole.
Multi-tenant, append-only merania, verzované legislatívne pravidlá,
kiosk režim pre kuchyňu, izolácia medzi pobočkami.

| Dokument | Obsah |
| --- | --- |
| `CLAUDE.md` | Pravidlá práce na projekte, invarianty, čo nerobiť |
| `TASK.md` | Čo staviame, pre koho, definícia MVP |
| `ROADMAP.md` | Prioritizovaný backlog a technický dlh |
| `DONE.md` | Aktuálny sprint a hotové položky |
| `CHANGELOG.md` | História zmien |
| `docs/ARCHITECTURE.md` | Architektúra a zdôvodnenie rozhodnutí |
| `docs/LIMITY-NA-OVERENIE.md` | Podklad pre právnu verifikáciu limitov |

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth) · Vercel

## Deploy — presný postup

### 1. Supabase projekt

1. Vytvor projekt na [supabase.com](https://supabase.com) (región `eu-central-1`).
2. SQL Editor → spusti migrácie z `supabase/migrations/` **v poradí**:
   `0001` až `0019` (poradie je dôležité — neskoršie stavajú na skorších).
3. *(Odporúčané, nie povinné)* **Authentication → Hooks → Customize Access
   Token (JWT) Claims** → schéma `public`, funkcia `custom_access_token_hook`.
   Hook vloží `tenant_id` priamo do tokenu a ušetrí jeden dotaz pri každej
   kontrole RLS. **Bez neho appka funguje** — resolúcia tenanta má fallback
   (viď `0005`).

### 2. Environment variables (Vercel → Project Settings)

```
NEXT_PUBLIC_SUPABASE_URL=        # Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # anon/public key
SUPABASE_SERVICE_ROLE_KEY=       # service_role key — NIKDY do klienta
```

Po zmene premenných treba **redeploy** — Vercel ich do bežiaceho nasadenia
nedoplní sám.

### 3. Deploy

```bash
git push               # repo pripojené na Vercel
# alebo: npx vercel --prod
```

### 4. Onboarding prvého tenanta

Otvor `/registracia` a vyplň formulár. Vznikne naraz účet, firma, prvá
prevádzka, jej tablet aj členstvo admina — **zásah do databázy netreba**.

Zvyšok už pridávaš v administrácii — vrátane názvu firmy, ďalších prevádzok
(tablet a párovací kód sa vytvoria automaticky), zariadení, zamestnancov
a rozvrhov.

### 4b. Overenie po nasadení

```bash
curl -s https://tvoja-domena.sk/api/health
# {"status":"ok","checks":{"app":"ok","database":"ok","config":"ok"},...}
```

Vráti `503` a `"status":"degraded"`, ak chýba premenná prostredia alebo
nefunguje spojenie s databázou. Vhodné ako endpoint pre monitoring —
appka bez DB vyzerá zvonku živá, ale kuchyňa cez ňu nezapíše ani meranie.

### 5. Spustenie kiosku

1. Párovací kód nájdeš v administrácii → **Prevádzky** (vytvorí sa spolu
   s prevádzkou) alebo → **Kiosky**, kde vieš pridať ďalší tablet.
2. Na tablete otvor `https://tvoja-domena.sk/kiosk` a zadaj kód — tablet
   zostane spárovaný natrvalo.
3. Flow merania: meno → PIN → zariadenie → teplota. PIN sa zadáva **raz za
   session**, ďalšie merania idú bez prerušenia. Cieľ < 10 sekúnd.

Admin rozhranie: `/login` → `/admin`.

## Bezpečnostný model (skratka)

- **Admini**: Supabase Auth session, RLS podľa tenanta. Tenant sa rieši
  dvojstupňovo — claim z JWT, inak lookup členstva podľa `auth.uid()`.
- **Kuchyňa**: žiadne osobné sessions. Tablet drží device token (httpOnly
  cookie, SHA-256 hash v DB), zápisy idú cez server actions so service role
  a explicitným tenant/location scopingom. PIN overuje identitu pracovníka
  pre audit záznam — kontroluje sa aj pri samotnom zápise, nielen pri
  odomknutí session.
- **Merania a nápravné opatrenia**: append-only na úrovni DB (trigger +
  odobraté grants).
- **Audit**: každá mutácia governed tabuliek → `audit_log`, do ktorého sa
  nedá písať priamo.

## Zálohovanie a obnova

Merania sú append-only a tvoria podklad pre kontrolu — ich strata sa nedá
nahradiť dodatočným zápisom. Pred ostrou prevádzkou over v Supabase
(Database → Backups):

- **Denné zálohy** sú na pláne Free len 7 dní a **bez Point-in-Time
  Recovery**. Pre platiacich zákazníkov je potrebný aspoň plán Pro s PITR —
  bez neho sa dá vrátiť nanajvýš na včerajšok.
- **Obnovu si raz vyskúšaj** na kópii projektu. Záloha, ktorú nikto nikdy
  neobnovil, je predpoklad, nie záloha.
- `audit_log`, `measurements` a `corrective_actions` sú nemenné; obnova sa
  preto robí vždy na úrovni celej databázy, nie jednotlivých riadkov.

## Vývoj

```bash
npm install
npm run dev
npm test            # unit testy (vitest)
npm run typecheck   # musí prejsť pred commitom
npm run build       # musí prejsť pred commitom
```

### E2E testy (Playwright)

Kiosk flow je jediná cesta, ktorou v produkte vzniká meranie, takže ho
overujeme v skutočnom prehliadači — vrátane tabletového viewportu a výpadku
pripojenia.

```bash
npx supabase start   # jednorazová DB, sama načíta migrácie aj supabase/seed.sql
npm run build
npm run test:e2e     # alebo: npm run test:e2e:ui
```

> ⚠️ **Nikdy nespúšťaj E2E proti ostrému projektu.** Testy zapisujú merania,
> ktoré sú append-only a nedajú sa zmazať — testovacie záznamy by navždy
> zostali v audite zákazníka.

Seed (`supabase/seed.sql`) vytvára firmu s dvoma prevádzkami, párovacím kódom
`E2ETEST` a PIN-om `4321`. Druhá prevádzka je tam zámerne — testy overujú, že
sa jej zamestnanci ani zariadenia na tablete prvej prevádzky **neobjavia**.

Všetko spolu beží aj v CI (`.github/workflows/ci.yml`): typecheck, unit testy,
build, SQL testy izolácie a E2E nad čerstvou databázou.

### Bezpečnostné testy (SQL)

Skripty v `supabase/tests/` sa spúšťajú v SQL Editore, bežia v transakcii
ukončenej ROLLBACKom a v DB po nich nič nezostane:

| Súbor | Čo overuje |
| --- | --- |
| `rls_isolation_test.sql` | Že firma nevidí dáta inej firmy (čítanie). Pred spustením treba doplniť dve UUID. |
| `write_isolation_test.sql` | Že sa nedá zapísať mimo vlastnej firmy (globálne limity, rozvrhy, merania, reset PIN pokusov). Self-contained, netreba nič upravovať. Beží aj v CI. |

Po každej zmene schémy spusti oba a zároveň `get_advisors` (security aj
performance).

Pracovné režimy sú v `.claude/commands/` (`/continue`, `/audit`, `/bugfix`,
`/review`, `/refactor`, `/plan`, `/docs`, `/release`).

## Stav projektu

Hotové: schéma + RLS + audit + verzované pravidlá, kiosk flow bez prerušovania
PIN-om, offline fronta meraní, rate limiting PIN-u, rozvrhy a evidencia
zmeškaných kontrol, viac prevádzok s izoláciou medzi nimi, pozvánky adminov,
kompletná administrácia (zariadenia, limity, zamestnanci, kiosky, história),
alarmy s nápravnými opatreniami, CSV export pre kontrolu, deploy pipeline,
unit + E2E + SQL testy v CI.

Ďalšie fázy podľa `ROADMAP.md`: PDF reporty · foto k meraniu · notifikácie
pri zmeškaní · adminovia obmedzení na jednu prevádzku.

### Pred predajom prvému zákazníkovi

Tri veci, ktoré sa nedajú vyriešiť kódom a musí ich niekto rozhodnúť:

1. ⚠️ **Právna verifikácia limitov.** Hodnoty v seede (`0002`) sú štandardné
   SK/EU teploty, ale nemajú doplnené `legal_ref` citácie a neprešli
   kontrolou odborníka. Denník, ktorý vyhodnocuje podľa neoverených limitov,
   je pri kontrole napadnuteľný. Podklad pre odborníka je pripravený
   v `docs/LIMITY-NA-OVERENIE.md`.
2. **Zapnúť leaked password protection** (Authentication → Passwords).
   Odkedy je registrácia verejná, heslo si volí zákazník a jediná kontrola
   je minimálna dĺžka 8 znakov.
3. **Zálohovanie s PITR** podľa sekcie vyššie.
