-- =============================================================================
-- HACCP SaaS — 0003_security_hardening
-- Fixný search_path pre SECURITY DEFINER funkcie a zúženie RPC plochy.
-- =============================================================================

alter function public.jwt_tenant_id() set search_path = public;
alter function public.jwt_app_role() set search_path = public;
alter function public.block_mutation() set search_path = public;

revoke execute on function public.audit_trigger() from anon, authenticated;
