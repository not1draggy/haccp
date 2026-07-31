-- =============================================================================
-- HACCP SaaS — 0004_device_limit_overrides
-- Vlastný limit per zariadenie (admin ho nastavuje v UI).
-- Globálne legislatívne pravidlo (rules) zostáva fallbackom.
-- =============================================================================

alter table public.devices
  add column min_c numeric(5,1),
  add column max_c numeric(5,1);
