-- =============================================================================
-- HACCP SaaS — 0019: indexy na cesty, ktoré rastú s prevádzkou
--
-- Linter hlási 17 neindexovaných cudzích kľúčov. Väčšina z nich je na malých
-- konfiguračných tabuľkách, kde by index nikdy nič neušetril (4 nepoužité
-- indexy už v projekte sú). Pridávame preto len tie, ktoré sú naozaj na
-- horúcej ceste — index, ktorý nikto nepoužije, len spomaľuje zápis.
--
-- memberships.user_id je z nich najdôležitejší: current_tenant_id() ním
-- hľadá členstvo pri KAŽDEJ kontrole RLS, ktorá nemá claim v JWT. A keďže
-- JWT hook je zámerne len optimalizácia, nie podmienka funkčnosti (0005),
-- treba počítať s tým, že fallback vetva beží často.
-- =============================================================================

-- Fallback resolúcia tenanta — najčastejší lookup v celom systéme.
create index if not exists memberships_user
  on public.memberships(user_id) where user_id is not null;

-- História a export spájajú meranie s pracovníkom, ktorý ho zapísal.
-- measurements je jediná tabuľka, ktorá rastie neobmedzene.
create index if not exists measurements_membership
  on public.measurements(membership_id);

-- Cron zmeškaných kontrol prechádza rozvrhy a dopytuje sa na ich zariadenia.
create index if not exists schedules_device
  on public.schedules(device_id);

-- Admin zoznamy filtrujú podľa zvolenej prevádzky.
create index if not exists kiosk_devices_location
  on public.kiosk_devices(location_id);
create index if not exists check_skips_location
  on public.check_skips(location_id);
create index if not exists missed_checks_location
  on public.missed_checks(location_id);
