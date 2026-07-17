-- IA + Regex: funções de transição de estado (Parte 3 de docs/roadmap/08-implementacao/).
-- Depende de 20260718000000_ia_regex_fundacao.sql (motor_extracao_log, taxa_acerto).

-- =============================================
-- Contagem incremental (chamada a cada uso de regex)
-- =============================================
create or replace function public.atualizar_metricas_regex(p_regex_id uuid, p_acerto integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.regex_metadata
  set
    total_uses = total_uses + 1,
    total_hits = total_hits + p_acerto,
    total_errors = total_errors + (1 - p_acerto),
    ultima_validacao_ia = now()
  where id = p_regex_id;
end;
$$;

-- =============================================
-- Transição de estado, com:
-- - Promoção automática pra global ao atingir 'confiavel'
-- - Rollback automático ('confiavel' -> 'quente') se performar mal depois
-- - Log em motor_extracao_log (feed do Super Admin, Parte 10)
-- =============================================
create or replace function public.check_regex_transition(p_regex_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_hits integer;
  v_state text;
  v_tenant_id uuid;
  v_novo_estado text;
  v_era_tenant_especifico boolean;
begin
  select total_uses, total_hits, state, tenant_id
    into v_total, v_hits, v_state, v_tenant_id
  from public.regex_metadata where id = p_regex_id;

  v_era_tenant_especifico := v_tenant_id is not null;

  if v_state = 'novo' and v_total >= 50 then
    if v_hits::float / v_total > 0.9 then
      v_novo_estado := 'quente';
    end if;
  elsif v_state = 'quente' and v_total >= 200 then
    if v_hits::float / v_total > 0.98 then
      v_novo_estado := 'confiavel';
    elsif v_hits::float / v_total < 0.85 then
      v_novo_estado := 'novo';
    end if;
  elsif v_state = 'confiavel' then
    if v_total >= 100 and v_hits::float / v_total < 0.97 then
      v_novo_estado := 'quente'; -- rollback automático
    end if;
  end if;

  if v_novo_estado is not null then
    update public.regex_metadata
    set state = v_novo_estado, updated_at = now()
    where id = p_regex_id;

    insert into public.motor_extracao_log (tipo, regex_id, tenant_id, detalhes)
    values ('mudanca_estado', p_regex_id, v_tenant_id,
      jsonb_build_object('estado_anterior', v_state, 'novo_estado', v_novo_estado,
                          'total_uses', v_total, 'total_hits', v_hits));

    -- Promoção automática pra global (08-ia-regex.md seção 5.5)
    if v_novo_estado = 'confiavel' and v_era_tenant_especifico then
      update public.regex_metadata set tenant_id = null where id = p_regex_id;

      insert into public.motor_extracao_log (tipo, regex_id, tenant_id, detalhes)
      values ('promocao_global', p_regex_id, v_tenant_id,
        jsonb_build_object('promovido_de_tenant', v_tenant_id));
    end if;
  end if;

  return v_novo_estado;
end;
$$;

revoke all on function public.atualizar_metricas_regex(uuid, integer) from public;
revoke all on function public.check_regex_transition(uuid) from public;

grant execute on function public.atualizar_metricas_regex(uuid, integer) to authenticated;
grant execute on function public.check_regex_transition(uuid) to authenticated;
