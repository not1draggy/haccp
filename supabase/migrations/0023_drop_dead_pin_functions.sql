-- =============================================================================
-- HACCP SaaS — 0023: odstránenie mŕtvych funkcií na PIN
--
-- `set_pin` a `verify_pin` zostali v databáze z čias, keď sa PIN riešil
-- v Postgrese cez pgcrypto. Aplikácia ich nevolá — PIN sa hashuje aj overuje
-- v Node cez `bcryptjs` (`src/app/kiosk/actions.ts`, `manage-actions.ts`).
-- Overené: nevolá ich ani žiadna iná funkcia v schéme.
--
-- Prečo ich nestačí nechať tak: `verify_pin` overí PIN a vráti totožnosť
-- pracovníka BEZ toho, aby čokoľvek zapísala do `pin_attempts`. Obchádza teda
-- ochranu proti hádaniu PIN-u, ktorú zavádza 0008. Je síce spustiteľná len
-- pre service role, ale mŕtva cesta okolo bezpečnostného opatrenia je presne
-- to, čo sa raz omylom použije.
--
-- Obnova (ak by sa PIN niekedy presúval späť do DB): definície sú v histórii
-- migrácií projektu a v zálohe pred týmto dátumom.
-- =============================================================================

drop function if exists public.verify_pin(uuid, text);
drop function if exists public.set_pin(uuid, text);

-- Pozostatok po premenovaní tabuľky v 0018 — constraint si niesol staré meno.
alter index if exists public.pairing_attempts_pkey rename to rate_limit_attempts_pkey;
