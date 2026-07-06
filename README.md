# HACCP SaaS

Cloudový HACCP systém pre gastro prevádzky. Multi-tenant, append-only merania,
verzované legislatívne pravidlá, kiosk režim pre kuchyňu.

Architektúra a zdôvodnenie rozhodnutí: `docs/ARCHITECTURE.md`.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Postgres + Auth) · Vercel

## Deploy — presný postup

### 1. Supabase projekt

1. Vytvor projekt na [supabase.com](https://supabase.com) (región `eu-central-1`).
2. SQL Editor → spusti postupne:
   - `supabase/migrations/0001_core.sql`
   - `supabase/migrations/0002_kiosk_schedules_seed.sql`
3. **Authentication → Hooks → Customize Access Token (JWT) Claims** →
   vyber funkciu `custom_access_token_hook`. Bez tohto kroku RLS nefunguje —
   JWT nebude obsahovať `tenant_id` a admin neuvidí žiadne dáta.

### 2. Environment variables (Vercel → Project Settings)

```
NEXT_PUBLIC_SUPABASE_URL=        # Project Settings → API
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # anon/public key
SUPABASE_SERVICE_ROLE_KEY=       # service_role key — NIKDY do klienta
```

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

-- Zamestnanec pre kiosk (PIN 1234):
-- hash vygeneruj: node -e "console.log(require('bcryptjs').hashSync('1234',10))"
insert into memberships (tenant_id, role, display_name, pin_hash) values
  ('11111111-1111-1111-1111-111111111111', 'employee', 'Peter Kuchár',
   '$2a$10$REPLACE_WITH_GENERATED_HASH');

-- Zariadenia (device_type UUID zo seedu v 0002)
insert into devices (tenant_id, location_id, device_type_id, name, sort_order) values
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'a0000000-0000-0000-0000-000000000001', 'Chladnička č. 1', 1),
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'a0000000-0000-0000-0000-000000000002', 'Mraznička', 2);

-- Párovací kód pre tablet
insert into kiosk_devices (tenant_id, location_id, name, pairing_code) values
  ('11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222', 'Tablet kuchyňa', 'ABC123');
```

### 5. Spustenie kiosku

Na tablete otvor `https://tvoja-domena.sk/kiosk` → zadaj `ABC123` →
tablet je natrvalo spárovaný. Flow merania: meno → PIN → zariadenie →
teplota → hotovo. Cieľ < 10 sekúnd.

Admin rozhranie: `/login` → `/admin`.

## Bezpečnostný model (skratka)

- **Admini**: Supabase Auth session, RLS podľa `tenant_id` z JWT claims.
- **Kuchyňa**: žiadne osobné sessions. Tablet drží device token (httpOnly
  cookie, SHA-256 hash v DB), zápisy idú cez server actions so service role
  a explicitným tenant/location scopingom. PIN overuje identitu pracovníka
  pre audit záznam.
- **Merania**: append-only na úrovni DB (trigger + revoked grants).
- **Audit**: každá mutácia governed tabuliek → `audit_log`, do ktorého sa
  nedá písať priamo.

## Stav projektu

Hotové: schéma + RLS + audit + verzované pravidlá, kiosk flow, admin
dashboard (alarmy + dnešné merania), login, deploy pipeline.

Ďalšie fázy (v poradí): pg_cron missed-check alarmy · offline queue
(IndexedDB) v kiosku · správa zamestnancov/zariadení v UI · nápravné
opatrenia UI · PDF reporty · pgTAP testy RLS · export CSV.

⚠️ Limity v seede (`0002`) sú štandardné SK/EU hodnoty, ale **pred predajom
vyžadujú právnu verifikáciu** a doplnenie `legal_ref` citácií.
