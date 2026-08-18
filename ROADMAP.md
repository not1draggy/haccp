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
      klientske UUID. Overené E2E testom na výpadok pripojenia — meranie sa
      uloží do tabletu a po obnovení siete sa odošle. Tým padlo posledné
      neodskúšané miesto z minulého sprintu.
- [x] **Rozvrhy a evidencia zmeškaných meraní** cez `pg_cron`.
- [x] **Limit pokusov na verejné endpointy** — párovanie tabletu a registrácia
      firmy (`0017`, `0018`). Počítadlo je v DB a per IP; ukladá sa iba hash IP.
- [ ] **Notifikácia pri zmeškaní** (email/push) — zmeškanie sa dnes zapíše,
      ale nikomu sa neozve; treba zvoliť kanál.
- [x] **PDF report za obdobie** (`/admin/report`) — podklad pre kontrolu so
      súhrnom, zvýraznenými prekročeniami limitu a osobitným upozornením na
      alarmy bez zapísaného nápravného opatrenia. Vlastný font (DejaVu orezaná
      na 22 kB), lebo zabudované PDF fonty nevedia slovenskú diakritiku.
- [ ] **Odoslanie pozvánky emailom.** Token sa dnes zobrazí adminovi a ten ho
      musí preposlať sám — funguje, ale pôsobí nedokončene.
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
- [x] Zapojiť RLS test do CI, aby bežal automaticky pri každej zmene schémy —
      `write_isolation_test.sql` beží v `.github/workflows/ci.yml` a FAIL
      v jeho výstupe zhodí build (PASS/FAIL sú dáta, nie chyby SQL).
- [x] E2E test kiosk flow (Playwright).
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
- [ ] **Policy `*_admin_write` sú `FOR ALL`, teda platia aj na SELECT** a
      zdvojujú sa s `*_read` pri každom čítaní (nález lintera
      `multiple_permissive_policies`, 8 tabuliek). Oprava znamená rozpísať ich
      na INSERT/UPDATE/DELETE. Zámerne odložené: úžitok je réžia policy, riziko
      je bezpečnostná regresia naprieč celou schémou. Robiť až s pokrytím
      `write_isolation_test.sql`, nie „pri príležitosti".
- [ ] **`next` má 3 HIGH CVE cez balíky `postcss` a `sharp`**, opraviteľné až
      prechodom na `next@16` (major). Overené, že v tejto aplikácii nie sú
      dosiahnuteľné: `next/image` sa nepoužíva (sharp sa nezavolá) a CSS
      nepochádza od používateľa. Upgrade spraviť samostatne a s E2E testom,
      nie ako súčasť bezpečnostnej opravy.
- [x] **E2E testy** (Playwright) — 22/22 zelených v CI: kiosk flow, párovanie,
      serverové vyhodnotenie limitu, izolácia prevádzok, offline fronta,
      verejné stránky a responzivita. Proti ostrému projektu ich spúšťať
      nemožno — merania sú append-only a testovacie záznamy by zostali
      v audite zákazníka.
