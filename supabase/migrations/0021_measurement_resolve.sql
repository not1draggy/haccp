-- =============================================================================
-- HACCP SaaS — 0021: vyhodnotenie merania na serveri (doplnenie driftu)
--
-- Tieto dva objekty existovali v produkcii, ale NEBOLI v žiadnej migrácii.
-- Odhalilo to CI: v čistej databáze prešlo meranie 12,5 °C v chladničke
-- (limit 0–5 °C) so stavom `ok`, ktorý poslal klient.
--
-- Je to najzávažnejší možný druh driftu, lebo `measurements_resolve` presadzuje
-- invariant, na ktorom stojí dôveryhodnosť celého denníka: status a limity
-- počíta server, klientovi sa verí len nameraná hodnota. Bez tohto triggeru
-- appka funguje a vyzerá správne — len zapisuje to, čo si tablet vypýta.
--
-- Prakticky to znamená, že obnova zálohy do nového projektu by vyrobila
-- denník, ktorý pri kontrole neobstojí, a nikto by si toho nemusel všimnúť.
--
-- V produkcii je migrácia no-op (`create or replace` s identickým telom).
-- =============================================================================

-- Vlastný limit zariadenia má prednosť pred globálnym pravidlom; z verzií
-- pravidla platí tá najnovšia, ktorá je k dnešnému dňu účinná.
create or replace function public.effective_limits(p_device_id uuid)
returns table(min_c numeric, max_c numeric, rule_id uuid)
language sql
stable
set search_path to 'public'
as $$
  select
    coalesce(d.min_c, r.min_c),
    coalesce(d.max_c, r.max_c),
    r.id
  from public.devices d
  left join public.rules r
    on  r.device_type_id = d.device_type_id
    and r.valid_from <= current_date
    and (r.valid_to is null or r.valid_to >= current_date)
  where d.id = p_device_id
  order by r.valid_from desc nulls last
  limit 1;
$$;

-- Tenant, prevádzka, limity aj status sa odvodzujú zo zariadenia — nič
-- z toho nesmie prísť od klienta. Meranie si zároveň drží FK na verziu
-- pravidla, podľa ktorej bolo vyhodnotené, aby zmena legislatívy spätne
-- neprepísala históriu.
create or replace function public.measurements_resolve()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_dev   record;
  v_limit record;
begin
  select id, tenant_id, location_id, active
    into v_dev
    from public.devices
   where id = new.device_id;

  if v_dev.id is null then
    raise exception 'Zariadenie % neexistuje.', new.device_id;
  end if;

  if not v_dev.active then
    raise exception 'Zariadenie je odobrané — zápis nie je povolený.';
  end if;

  new.tenant_id   := v_dev.tenant_id;
  new.location_id := v_dev.location_id;

  select * into v_limit from public.effective_limits(new.device_id);

  new.rule_id       := v_limit.rule_id;
  new.min_c_applied := v_limit.min_c;
  new.max_c_applied := v_limit.max_c;

  new.status := case
    when v_limit.min_c is not null and new.value_c < v_limit.min_c then 'alarm'
    when v_limit.max_c is not null and new.value_c > v_limit.max_c then 'alarm'
    else 'ok'
  end;

  return new;
end;
$$;

create or replace trigger measurements_resolve
  before insert on public.measurements
  for each row execute function public.measurements_resolve();
