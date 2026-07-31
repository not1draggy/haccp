-- =============================================================================
-- HACCP SaaS — 0006_revoke_rpc_surface
-- Zúženie RPC plochy vystavenej cez PostgREST.
--
-- Trigger funkcie nemajú byť volateľné cez /rest/v1/rpc/*. Predchádzajúci
-- revoke minul default grant pre rolu PUBLIC, preto sa naďalej objavovali
-- v bezpečnostnom linteri.
-- =============================================================================

revoke execute on function public.audit_trigger()  from public, anon, authenticated;
revoke execute on function public.block_mutation() from public, anon, authenticated;

-- current_tenant_id/current_app_role musia zostať spustiteľné pre authenticated,
-- inak zlyhá vyhodnotenie RLS policies (výraz policy sa vyhodnocuje právami
-- volajúceho). Odoberáme aspoň anonymnú a PUBLIC cestu. Zvyškové RPC vystavenie
-- je neškodné: funkcie sú viazané na auth.uid(), takže vrátia nanajvýš vlastný
-- tenant volajúceho.
revoke execute on function public.current_tenant_id() from public, anon;
revoke execute on function public.current_app_role() from public, anon;
grant  execute on function public.current_tenant_id() to authenticated;
grant  execute on function public.current_app_role()  to authenticated;

revoke execute on function public.jwt_tenant_id() from public, anon;
revoke execute on function public.jwt_app_role()  from public, anon;
