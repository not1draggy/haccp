# HACCP SaaS

Cloudový HACCP systém pre gastro prevádzky. Multi-tenant, append-only merania,
verzované legislatívne pravidlá, kiosk režim pre kuchyňu.

| Dokument | Obsah |
| --- | --- |
| `CLAUDE.md` | Pravidlá práce na projekte, invarianty, čo nerobiť |
| `TASK.md` | Čo staviame, pre koho, definícia MVP |
| `ROADMAP.md` | Prioritizovaný backlog a technický dlh |
| `DONE.md` | Aktuálny sprint a hotové položky |
| `CHANGELOG.md` | História zmien |
| `docs/ARCHITECTURE.md` | Architektúra a zdôvodnenie rozhodnutí |

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth) · Vercel

## Deploy — presný postup

### 1. Supabase projekt

1. Vytvor projekt na [supabase.com](https://supabase.com) (región `eu-central-1`).
2. SQL Editor → spusti migrácie z `supabase/migrations/` **v poradí**:
   `0001` → `0002` → `0003` → `0004` → `0005` → `0006` → `0007`.
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

### 4. Onboarding prvého tenanta (SQL Editor)

```sql
-- Tenant + prevádzka
insert into tenants (id, name) values
  ('11111111-1111-1111-1111-111111111111', 'Reštaurácia U Janka');

insert into locations (id, tenant_id, name) values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111', 'Hlavná prevádzka');

-- Admin: najprv vytvor používateľa v Authentication → Users (email+heslo),
-- skopíruj jeho UUID a vlož sem:
insert into memberships (tenant_id, user_id, role, display_name) values
  ('11111111-1111-1111-1111-111111111111',
   'AUTH_USER_UUID', 'tenant_admin', 'Ján Novák');
```

Zvyšok — zariadenia, zamestnancov s PIN kódmi aj kiosky — už pridávaš
**v administrácii**, nie cez SQL.

### 5. Spustenie kiosku

1. V administrácii → **Kiosky** pridaj tablet; vygeneruje sa párovací kód.
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

## Vývoj

```bash
npm install
npm run dev
npm run typecheck   # musí prejsť pred commitom
npm run build       # musí prejsť pred commitom
```

Pracovné režimy sú v `.claude/commands/` (`/continue`, `/audit`, `/bugfix`,
`/review`, `/refactor`, `/plan`, `/docs`, `/release`).

## Stav projektu

Hotové: schéma + RLS + audit + verzované pravidlá, kiosk flow bez prerušovania
PIN-om, kompletná administrácia (zariadenia, limity, zamestnanci, kiosky),
alarmy s nápravnými opatreniami, CSV export pre kontrolu, deploy pipeline.

Ďalšie fázy podľa `ROADMAP.md`: offline queue v kiosku · pg_cron alarmy zo
zmeškaných meraní · PDF reporty · viac prevádzok v UI · pgTAP testy RLS.

⚠️ Limity v seede (`0002`) sú štandardné SK/EU hodnoty, ale **pred predajom
vyžadujú právnu verifikáciu** a doplnenie `legal_ref` citácií.
