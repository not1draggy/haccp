-- =============================================================================
-- HACCP SaaS — 0007_corrective_actions
-- Nápravné opatrenia k alarmom. Kontrola sa pri prekročení limitu vždy pýta
-- "a čo ste s tým urobili?" — bez záznamu je alarm len číslo.
-- Rovnako ako merania: append-only, auditované.
-- =============================================================================

create table public.corrective_actions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  measurement_id uuid not null references public.measurements(id),
  author_user_id uuid references auth.users(id) on delete set null,
  action         text not null check (length(btrim(action)) between 1 and 2000),
  created_at     timestamptz not null default now()
);

create index corrective_actions_measurement on public.corrective_actions(measurement_id);
create index corrective_actions_tenant_time on public.corrective_actions(tenant_id, created_at desc);

create trigger corrective_actions_append_only
  before update or delete on public.corrective_actions
  for each row execute function public.block_mutation();

revoke update, delete on public.corrective_actions from anon, authenticated;

create trigger corrective_actions_audit
  after insert on public.corrective_actions
  for each row execute function public.audit_trigger();

alter table public.corrective_actions enable row level security;

create policy corrective_actions_read on public.corrective_actions
  for select to authenticated
  using (tenant_id = public.current_tenant_id());

create policy corrective_actions_admin_insert on public.corrective_actions
  for insert to authenticated
  with check (
    tenant_id = public.current_tenant_id()
    and public.current_app_role() = 'tenant_admin'
    -- meranie musí patriť tomu istému tenantovi
    and exists (
      select 1 from public.measurements m
       where m.id = measurement_id
         and m.tenant_id = public.current_tenant_id()
    )
  );
