-- =============================================================================
-- HACCP SaaS — 0022: limity, podľa ktorých bolo meranie vyhodnotené
--
-- Posledné dva stĺpce, ktoré existovali v produkcii, ale chýbali v migráciách.
-- Zapisuje do nich trigger `measurements_resolve` z 0021, takže bez nich
-- zlyhá KAŽDÝ zápis merania — odhalilo to CI, keď v čistej databáze spadol
-- celý kiosk flow.
--
-- Účel stĺpcov: meranie si okrem FK na verziu pravidla drží aj konkrétne
-- hodnoty limitu, podľa ktorých bolo vyhodnotené. Vlastný limit zariadenia
-- (`devices.min_c/max_c`) totiž nie je verzovaný — keby ho niekto zmenil,
-- z FK na pravidlo by sa už nedalo zrekonštruovať, prečo bol starý záznam
-- vyhodnotený ako alarm. Pri kontrole je to rozdiel medzi doložiteľným
-- a nedoložiteľným záznamom.
--
-- V produkcii no-op (`if not exists`).
-- =============================================================================

alter table public.measurements
  add column if not exists min_c_applied numeric,
  add column if not exists max_c_applied numeric;

comment on column public.measurements.min_c_applied is
  'Spodný limit platný v čase merania — vlastný limit zariadenia má prednosť pred pravidlom.';
comment on column public.measurements.max_c_applied is
  'Horný limit platný v čase merania — vlastný limit zariadenia má prednosť pred pravidlom.';
