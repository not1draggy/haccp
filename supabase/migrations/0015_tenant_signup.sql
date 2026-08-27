-- =============================================================================
-- HACCP SaaS — 0015_tenant_signup
-- Registrácia novej firmy. Produkt je multi-tenant, ale doteraz sa nový
-- tenant dal založiť iba ručne cez SQL — každý ďalší podnik znamenal zásah
-- do databázy.
--
-- Prečo jedna funkcia a nie štyri inserty zo server action:
--   založenie firmy je štyri závislé zápisy (tenant → prevádzka → tablet →
--   členstvo admina). Ak by ktorýkoľvek zlyhal medzi krokmi, ostane firma
--   bez admina alebo prevádzka bez tabletu — teda účet, s ktorým sa nedá nič
--   robiť a ktorý sa nedá ani zmazať cez UI. Tu je to jedna transakcia.
--
-- Volateľné výhradne service_role: v momente registrácie ešte neexistuje
-- členstvo, takže RLS by zápis neprepustila, a zároveň sa funkcia nesmie dať
-- zavolať anonymne cez /rest/v1/rpc (inak by ktokoľvek vyrábal tenantov).
-- =============================================================================

create or replace function public.register_tenant(
  p_user_id       uuid,
  p_company_name  text,
  p_location_name text,
  p_admin_name    text
)
returns table (tenant_id uuid, location_id uuid, pairing_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   uuid;
  v_location uuid;
  v_code     text;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p_user_id is null then
    raise exception 'register_tenant: chýba user_id';
  end if;

  -- Jeden účet = jedna firma. Bez tejto kontroly by opakované odoslanie
  -- formulára založilo druhého tenanta a používateľ by skončil v tom,
  -- ktorý mu current_tenant_id() vyberie ako prvý.
  if exists (select 1 from public.memberships where user_id = p_user_id) then
    raise exception 'register_tenant: účet už patrí do firmy'
      using errcode = 'unique_violation';
  end if;

  insert into public.tenants (name)
  values (nullif(btrim(p_company_name), ''))
  returning id into v_tenant;

  insert into public.locations (tenant_id, name)
  values (v_tenant, nullif(btrim(p_location_name), ''))
  returning id into v_location;

  -- Kód diktuje personál naprieč kuchyňou, preto bez znakov, ktoré si mýlia
  -- (0/O, 1/I/L). Rovnaká abeceda ako v generatePairingCode() na strane appky.
  for i in 1..20 loop
    v_code := '';
    for j in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.kiosk_devices k where k.pairing_code = v_code
    );
    v_code := null;
  end loop;

  if v_code is null then
    raise exception 'register_tenant: nepodarilo sa vygenerovať voľný kód';
  end if;

  insert into public.kiosk_devices (tenant_id, location_id, name, pairing_code)
  values (v_tenant, v_location, 'Tablet — ' || btrim(p_location_name), v_code);

  insert into public.memberships (tenant_id, user_id, role, display_name)
  values (v_tenant, p_user_id, 'tenant_admin', nullif(btrim(p_admin_name), ''));

  return query select v_tenant, v_location, v_code;
end;
$$;

revoke execute on function public.register_tenant(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.register_tenant(uuid, text, text, text)
  to service_role;
