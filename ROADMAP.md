# ROADMAP.md

Priorita zhora nadol. Položky sa presúvajú do DONE.md až keď sú overené
(typecheck + build + reálne preklikané v nasadenej appke).

## P0 — MVP-kritické (bez toho sa produkt nedá predať)

- [x] **Export histórie meraní (CSV)** — kontrolór musí dostať dáta von.
- [x] **Nápravné opatrenia pri alarme** — bez záznamu, čo sa urobilo, je
      alarm len číslo a kontrola sa spýta „a čo ste s tým spravili?".
- [ ] **Právna verifikácia limitov** + doplnenie `legal_ref` citácií do
      `rules`. Blokuje predaj. Vyžaduje externého odborníka, nie kód.

## P1 — Prevádzková spoľahlivosť

- [x] **Rate limiting na PIN** — 4-miestny PIN má 10 000 kombinácií.
      Limit je v DB, lebo serverless inštancie nezdieľajú pamäť.
- [x] **Offline queue v kiosku (IndexedDB)** vrátane idempotencie cez
      klientske UUID. ⚠️ Neodskúšané za behu v prehliadači.
- [x] **Rozvrhy a evidencia zmeškaných meraní** cez `pg_cron`.
- [ ] **Notifikácia pri zmeškaní** (email/push) — zmeškanie sa dnes zapíše,
      ale nikomu sa neozve; treba zvoliť kanál.
- [ ] **PDF report za obdobie** — mesačný podklad pre kontrolu.
- [ ] Zapnúť **leaked password protection** v Supabase Auth (Dashboard →
      Authentication → Passwords). Nález bezpečnostného lintera, nedá sa
      spraviť z kódu. Odkedy je registrácia verejná (`/registracia`), heslo
      si volí zákazník sám a jediná kontrola je minimálna dĺžka 8 znakov —
      priorita tým stúpla.

## P2 — Škálovanie a viac prevádzok

- [x] **Podpora viacerých prevádzok (locations) v UI** vrátane prepínača,
      scopingu všetkých obrazoviek a izolácie medzi pobočkami.
- [x] **Samoregistrácia firmy** (migrácia `0015`, `/registracia`) — nový
      zákazník už nepotrebuje zásah do DB. Tenant, prevádzka, tablet aj
      členstvo admina vznikajú v jednej transakcii.
- [ ] **Admin obmedzený na jednu prevádzku** (rola `location_admin`).
      Dnes majiteľ vidí všetky pobočky, čo je správne; vedúci jednej
      pobočky však zatiaľ nemá vlastný obmedzený prístup.
- [x] **Pozvanie ďalšieho admina** — pozvánkový flow s tokenom (v DB hash).
- [x] Stránkovanie a filtrovanie histórie meraní.
- [x] Vlastná správa typov zariadení per tenant.

## P3 — Kvalita a UX

- [x] **Test izolácie RLS** (`supabase/tests/rls_isolation_test.sql`) —
      overuje reálnym dotazom, že tenant A nevidí dáta tenanta B.
- [ ] Zapojiť RLS test do CI, aby bežal automaticky pri každej zmene schémy.
- [ ] E2E test kiosk flow (Playwright).
- [x] Poznámka k meraniu.
- [ ] Foto k meraniu (potrebuje Storage bucket + policies; stĺpec bol
      medzitým odstránený, aby schéma nesľubovala niečo, čo nerobí).
- [x] „Preskočiť meranie s dôvodom".
- [x] Trend indikátor (šípka oproti minulej hodnote).
- [ ] QR / čiarový kód na identifikáciu zariadenia.
- [x] Hromadný import zariadení (CSV).
- [x] Prístupnosť kiosku: `aria-live` pre výsledok merania, `role="alert"`
      pre chyby, popisy kláves, ovládanie fyzickou klávesnicou.
- [ ] Prístupnosť: overiť kontrast `warn` (#d97706) na tmavom pozadí kiosku
      voči WCAG AA a prejsť admin rozhranie čítačkou.

## Technický dlh

- [ ] `getScope()` v `manage-actions.ts` robí 2 dotazy pri každej mutácii —
      dá sa zlúčiť alebo cachovať v rámci requestu.
- [x] Admin dashboard pároval merania k zariadeniam podľa názvu — opravené
      na `device_id`.
- [x] Chýbal globálny error boundary.
- [x] Žiadny rate limiting na overovanie PIN.
- [ ] `verifyEmployeePin` sa volá dvakrát za meranie (raz pri odomknutí, raz
      pri zápise) — každé volanie je jeden bcrypt a dva RPC dotazy navyše.
      Pri desiatkach meraní denne to zatiaľ nevadí, ale pri offline queue
      s dávkovým odosielaním to bude treba prehodnotiť.
