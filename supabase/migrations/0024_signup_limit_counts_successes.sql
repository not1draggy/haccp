-- =============================================================================
-- HACCP SaaS — 0024: limit registrácie musí počítať aj úspešné pokusy
--
-- Pôvodná verzia (0018) počítala pri oboch scope-och iba neúspešné pokusy.
-- Pri párovaní tabletu je to správne — zneužitie tam znamená hádanie kódu,
-- teda sériu neúspechov, kým personál sa občas preklepne a nemá byť trestaný.
--
-- Pri registrácii firmy je to však presne naopak: zneužitím JE úspech.
-- Skript, ktorému každý pokus vyjde, nezapísal ani jeden neúspech, takže
-- počítadlo zostávalo na nule a limit nezabránil ničomu. Verejný endpoint
-- zakladajúci auth účet aj firmu tak bol fakticky neobmedzený — presne to,
-- čo mala 0018 vyriešiť.
--
-- Pre `signup` sa preto počítajú všetky pokusy v okne, pre `pairing` naďalej
-- iba neúspešné.
-- =============================================================================

create or replace function public.rate_limit_locked_seconds(
  p_scope text,
  p_ip_hash text
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_window     interval;
  v_max        int;
  v_len_uspech boolean;
  v_pocet      int;
  v_oldest     timestamptz;
begin
  if p_scope = 'signup' then
    v_window     := interval '60 minutes';
    v_max        := 5;
    v_len_uspech := false;  -- počítaj všetko: zneužitím je úspešná registrácia
  else
    v_window     := interval '15 minutes';
    v_max        := 10;
    v_len_uspech := true;   -- počítaj len neúspechy: zneužitím je hádanie kódu
  end if;

  select count(*), min(attempted_at)
    into v_pocet, v_oldest
    from public.rate_limit_attempts
   where scope = p_scope
     and ip_hash = p_ip_hash
     and attempted_at > now() - v_window
     and (not v_len_uspech or not succeeded);

  if v_pocet >= v_max then
    return greatest(0, ceil(extract(epoch from (v_oldest + v_window - now()))))::int;
  end if;

  return 0;
end;
$$;

revoke execute on function public.rate_limit_locked_seconds(text, text) from public, anon, authenticated;
grant  execute on function public.rate_limit_locked_seconds(text, text) to service_role;
