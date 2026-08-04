-- =============================================================================
-- HACCP SaaS — 0011: nárokovaný čas offline merania
--
-- Offline meranie sa odošle až po obnovení spojenia, takže measured_at (čas
-- servera) je neskôr ako skutočné odmeranie. Nemôžeme však dovoliť, aby čas
-- určoval klient — spätné datovanie je presne to, proti čomu je celý
-- append-only žurnál. Preto dva časy:
--   measured_at        — kedy záznam prijal server (autoritatívny, dôveryhodný)
--   client_measured_at — kedy meranie podľa tabletu vzniklo (informatívny)
-- Kontrolór tak vidí "zapísané 14:32, tablet hlási odmeranie 13:10 (offline)"
-- namiesto falošne presného jediného času.
-- =============================================================================

alter table public.measurements
  add column if not exists client_measured_at timestamptz;

comment on column public.measurements.client_measured_at is
  'Čas odmerania nahlásený kioskom pri offline zápise. Neoverený — autoritatívny je measured_at.';
