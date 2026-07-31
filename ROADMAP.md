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
- [ ] **Offline queue v kiosku (IndexedDB)** — kuchyňa má slabú wifi.
      Meranie sa musí uložiť lokálne a odoslať po obnovení spojenia.
      Pozor na append-only: prehrávanie frontu nesmie vytvárať duplikáty
      (idempotencia cez klientske UUID merania). Pozor aj na rate limiting —
      dávkové odoslanie nesmie vyzerať ako útok hrubou silou.
- [ ] **Rozvrhy a alarmy zo zmeškaných meraní** — tabuľka `schedules` už
      existuje, chýba vyhodnocovanie cez `pg_cron` + notifikácia.
- [ ] **PDF report za obdobie** — mesačný podklad pre kontrolu.
- [ ] Zapnúť **leaked password protection** v Supabase Auth (Dashboard →
      Authentication → Passwords). Nález bezpečnostného lintera, nedá sa
      spraviť z kódu.

## P2 — Škálovanie a viac prevádzok

- [ ] **Podpora viacerých prevádzok (locations) v UI** — schéma to už vie,
      admin však pracuje s prvou prevádzkou (`limit 1`). Treba prepínač
      prevádzky a scoping všetkých obrazoviek.
- [ ] **Pozvanie ďalšieho admina** — teraz sa membership pre `tenant_admin`
      vytvára ručne cez SQL. Chýba pozvánkový flow.
- [ ] Stránkovanie histórie meraní (teraz `limit 200/300`).
- [ ] Vlastná správa typov zariadení per tenant.

## P3 — Kvalita a UX

- [x] **Test izolácie RLS** (`supabase/tests/rls_isolation_test.sql`) —
      overuje reálnym dotazom, že tenant A nevidí dáta tenanta B.
- [ ] Zapojiť RLS test do CI, aby bežal automaticky pri každej zmene schémy.
- [ ] E2E test kiosk flow (Playwright).
- [ ] Poznámka a foto k meraniu.
- [ ] „Preskočiť meranie s dôvodom".
- [ ] Trend indikátor (šípka oproti minulej hodnote).
- [ ] QR / čiarový kód na identifikáciu zariadenia.
- [ ] Hromadný import zariadení (CSV).
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
