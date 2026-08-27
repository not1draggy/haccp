-- =============================================================================
-- HACCP SaaS — 0025: PIN prevádzky pre prihlásenie kiosku
--
-- Doteraz stačil na otvorenie kiosku párovací kód a tablet zostal spárovaný
-- rok. Kto sa raz dostal ku kódu, mal prevádzku otvorenú natrvalo, a prehliadač
-- s uloženou cookie otváral kuchyňu bez akéhokoľvek overenia.
--
-- Odteraz je vstup do kiosku dvojica KÓD PREVÁDZKY + PIN. PIN sa ukladá iba
-- ako bcrypt hash, rovnako ako PIN zamestnanca — v DB nie je nikdy čitateľný.
--
-- `pin_hash` je zámerne nullable: existujúce tablety ho ešte nemajú a migrácia
-- im ho nesmie vymyslieť (nikto by ten PIN nepoznal). Prihlásenie bez
-- nastaveného PIN-u aplikácia odmietne a v administrácii je pri takom tablete
-- výstraha — radšej nech kuchyňa raz zavolá adminovi, než aby sa prevádzka
-- otvárala na samotný kód.
-- =============================================================================

alter table public.kiosk_devices
  add column if not exists pin_hash text;

comment on column public.kiosk_devices.pin_hash is
  'bcrypt hash PIN-u prevádzky. NULL = PIN nenastavený, kiosk sa neprihlási.';

-- Administrácia potrebuje vedieť, či PIN nastavený JE, ale hash čítať nemá.
-- Odvodený stĺpec túto jedinú informáciu vystaví bez toho, aby sprístupnil
-- samotný hash.
alter table public.kiosk_devices
  add column if not exists pin_set boolean
  generated always as (pin_hash is not null) stored;

-- ---------------------------------------------------------------------------
-- Tajomstvá tabletu nesmú byť čitateľné cez API ani pre prihláseného admina.
--
-- Column-level REVOKE je pri existujúcom table-level grante bez účinku, preto
-- sa právo na čítanie odoberá celé a vracia sa výpočtom stĺpcov. Nový stĺpec
-- tým prestane byť automaticky čitateľný — pri tabuľke, ktorá drží PIN aj
-- device token, je to žiaduce: doplniť ho do zoznamu je vedomé rozhodnutie.
-- ---------------------------------------------------------------------------
revoke select on public.kiosk_devices from anon, authenticated;

grant select (
  id, tenant_id, location_id, name, pairing_code,
  paired_at, last_seen_at, active, created_at, pin_set
) on public.kiosk_devices to anon, authenticated;
