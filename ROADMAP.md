# ROADMAP.md

Priorita zhora nadol. Položky sa presúvajú do DONE.md až keď sú overené
(typecheck + build + reálne preklikané v nasadenej appke).

## P0 — MVP-kritické (bez toho sa produkt nedá predať)

- [x] **Export histórie meraní (CSV)** — kontrolór musí dostať dáta von.
      Filtrovanie podľa obdobia a zariadenia.
- [x] **Nápravné opatrenia pri alarme** — pri prekročení limitu treba
      zaznamenať, čo sa urobilo (presun tovaru, servis, likvidácia).
      Bez toho je alarm len číslo a kontrola sa spýta „a čo ste s tým spravili?".
- [ ] **Právna verifikácia limitov** + doplnenie `legal_ref` citácií do
      `rules`. Blokuje predaj. Vyžaduje externého odborníka, nie kód.

## P1 — Prevádzková spoľahlivosť

- [ ] **Offline queue v kiosku (IndexedDB)** — kuchyňa má slabú wifi.
      Meranie sa musí uložiť lokálne a odoslať po obnovení spojenia.
      Pozor na append-only: prehrávanie frontu nesmie vytvárať duplikáty
      (idempotencia cez klientske UUID merania).
- [ ] **Rozvrhy a alarmy zo zmeškaných meraní** — tabuľka `schedules` už
      existuje, chýba vyhodnocovanie cez `pg_cron` + notifikácia.
- [ ] **PDF report za obdobie** — mesačný podklad pre kontrolu.
- [ ] Zapnúť **leaked password protection** v Supabase Auth (Dashboard →
      Authentication → Passwords). Nález bezpečnostného lintera.

## P2 — Škálovanie a viac prevádzok

- [ ] **Podpora viacerých prevádzok (locations) v UI** — schéma to už vie,
      admin však pracuje s prvou prevádzkou (`limit 1`). Treba prepínač
      prevádzky a scoping všetkých obrazoviek.
- [ ] **Pozvanie ďalšieho admina** — teraz sa membership pre `tenant_admin`
      vytvára ručne cez SQL. Chýba pozvánkový flow.
- [ ] Stránkovanie histórie meraní (teraz `limit 200/300`).
- [ ] Vlastná správa typov zariadení per tenant.

## P3 — Kvalita a UX

- [ ] **pgTAP testy RLS** — automaticky overiť, že tenant A nevidí dáta
      tenanta B. Teraz overené len manuálne.
- [ ] E2E test kiosk flow (Playwright).
- [ ] Poznámka a foto k meraniu.
- [ ] „Preskočiť meranie s dôvodom".
- [ ] Trend indikátor (šípka oproti minulej hodnote).
- [ ] QR / čiarový kód na identifikáciu zariadenia.
- [ ] Hromadný import zariadení (CSV).
- [ ] Prístupnosť: prejsť kiosk klávesnicou, doplniť `aria-live` pre výsledok
      merania, overiť kontrast `warn` na tmavom pozadí.

## Technický dlh

- [ ] `getScope()` v `manage-actions.ts` robí 2 dotazy pri každej mutácii —
      dá sa zlúčiť alebo cachovať v rámci requestu.
- [ ] Admin dashboard páruje merania k zariadeniam **podľa názvu**, nie podľa
      `device_id`. Pri dvoch zariadeniach s rovnakým názvom to zlyhá.
- [ ] Chýba globálny error boundary — server chyba dá bielu stránku
      s „Application error".
- [ ] Žiadny rate limiting na overovanie PIN (brute force 4-miestneho PIN).
