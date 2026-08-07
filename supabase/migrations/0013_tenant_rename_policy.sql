-- =============================================================================
-- HACCP SaaS — 0013: premenovanie firmy z administrácie
--
-- Názov firmy sa doteraz nedal zmeniť inak než cez SQL — tabuľka tenants mala
-- iba SELECT policy. Pre zákazníka je to pritom prvá vec, ktorú chce upraviť:
-- zobrazuje sa v hlavičke aj v podkladoch odovzdávaných kontrole.
--
-- Zmena je auditovaná existujúcim triggerom tenants_audit.
-- =============================================================================

drop policy if exists tenants_admin_update on public.tenants;
create policy tenants_admin_update on public.tenants
  for update to authenticated
  using (id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin')
  with check (id = public.current_tenant_id() and public.current_app_role() = 'tenant_admin');
