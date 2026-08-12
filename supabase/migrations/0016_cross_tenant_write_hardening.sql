-- =============================================================================
-- HACCP SaaS — 0016: uzavretie zápisov, ktoré prekračovali hranicu firmy
--
-- Tri nálezy z auditu, všetky overené reálnym dotazom pod rolou `authenticated`
-- s claimami cudzieho tenanta (transakcia ukončená ROLLBACKom):
--
-- 1. rules — KRITICKÉ. Tabuľka je GLOBÁLNA (nemá tenant_id), drží zákonné
--    limity, podľa ktorých sa vyhodnocuje meranie každej firmy na platforme.
--    Policy `rules_admin_write` však vyžadovala iba `jwt_app_role() =
--    'tenant_admin'` — bez akéhokoľvek scopingu. Ktorýkoľvek admin
--    ktorejkoľvek firmy tak mohol prepísať alebo ZMAZAŤ limit platný pre
--    všetkých ostatných zákazníkov. Overené: UPDATE aj DELETE prešli.
--
--    Následok by bol tichý: meranie by sa naďalej zapisovalo, len by sa
--    vyhodnocovalo podľa podvrhnutého limitu — teda presne to, čo má denník
--    pri kontrole dokazovať, by prestalo platiť.
--
--    Limity sú legislatíva, nie zákaznícke nastavenie. Cez API ich preto
--    nesmie meniť nikto; menia sa migráciou (service role) po právnej
--    verifikácii. Vlastný limit zariadenia (devices.min_c/max_c) zostáva
--    nedotknutý — to je legitímne prísnejšie nastavenie firmy.
--
-- 2. schedules — rozvrh sa dal naviazať na zariadenie CUDZEJ firmy. Policy
--    kontrolovala len `tenant_id` riadku rozvrhu, nie vlastníctvo zariadenia
--    v device_id. Overené: insert prešiel. Rovnaký vzor kontroly už používa
--    corrective_actions_admin_insert, tu chýbal.
--
-- 3. measurements — policy `measurements_insert` dovoľovala zápis merania
--    prihlásenému používateľovi. Aplikácia takto merania nikdy nezapisuje
--    (jediný zápis je kiosk cez service role), takže policy bola čistá
--    útočná plocha: admin mohol obísť kiosk aj PIN a vyrobiť záznam bez
--    podpisu pracovníka. Meranie má vzniknúť pri zariadení, nie v kancelárii.
-- =============================================================================

-- ---------------------------------------------------------------- 1. rules
drop policy if exists rules_admin_write on public.rules;

-- Čítanie zostáva verejné pre prihlásených — limit musí vidieť každý, kto
-- podľa neho vyhodnocuje. Zápis nemá cez API nikto.
revoke insert, update, delete, truncate on public.rules from authenticated, anon;

-- ------------------------------------------------------------ 2. schedules
drop policy if exists schedules_admin_write on public.schedules;
create policy schedules_admin_write on public.schedules
  for all to authenticated
  using (
    tenant_id = public.current_tenant_id()
    and public.current_app_role() = 'tenant_admin'
  )
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_app_role() = 'tenant_admin'
    -- Zariadenie musí patriť tej istej firme, inak by rozvrh (a z neho
    -- generované zmeškané kontroly) ukazoval na cudziu prevádzku.
    and exists (
      select 1 from public.devices d
       where d.id = schedules.device_id
         and d.tenant_id = public.current_tenant_id()
    )
  );

-- --------------------------------------------------------- 3. measurements
-- Merania zapisuje výhradne kiosk cez service role, ktorý RLS obchádza.
-- Bez tejto policy nemá prihlásený používateľ na measurements žiadny INSERT.
drop policy if exists measurements_insert on public.measurements;
revoke insert on public.measurements from authenticated, anon;
