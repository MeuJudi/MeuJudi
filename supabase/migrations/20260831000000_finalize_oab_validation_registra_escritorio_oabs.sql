-- Achado 31/08/2026: validar a OAB de um membro da equipe (via ConfirmADV
-- ou validação manual do Admin) nunca registrava essa OAB em
-- `escritorio_oabs` — que é a tabela que os crons de descoberta
-- (`solicitar-pdpj`/`solicitar-mural`, a cada 6h) realmente consultam.
-- Resultado real: usuário "Luis" teve a OAB validada, mas nunca teve
-- nenhum processo buscado — a OAB dele nunca existiu em nenhum lugar que
-- o sistema de descoberta olha.
--
-- `finalize_oab_validation` é o ponto único chamado pelos dois caminhos de
-- validação (ConfirmADV via CS e validação manual do Admin), então
-- corrigir aqui resolve os dois de uma vez. Upsert com ON CONFLICT porque
-- a OAB pode já existir (ex.: institucional, cadastrada por outro fluxo).

create or replace function public.finalize_oab_validation(
  p_user_id uuid,
  p_tenant_id uuid,
  p_oab_number text,
  p_oab_uf text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1. Marca a OAB do usuário como validada. Só atualiza se o user
  -- ainda pertence ao tenant (defesa contra corrida com revoke).
  update public.users
    set oab_number = p_oab_number,
        oab_uf = p_oab_uf,
        oab_validated_at = now()
    where id = p_user_id
      and tenant_id = p_tenant_id;

  -- Se nenhum user foi atualizado, aborta a transação antes de qualquer
  -- outro efeito (mesmo invariante de antes: ou atualiza tudo, ou nada).
  if not found then
    raise exception 'user_nao_encontrado_ou_tenant_diferente' using errcode = 'P0001';
  end if;

  -- 2. [corrigido 31/08/2026] Registra a OAB validada em `escritorio_oabs`
  -- — sem isso, ela fica invisível pros crons de descoberta pra sempre.
  -- ON CONFLICT porque a OAB pode já existir (ex.: cadastro manual prévio
  -- em Configurações, ou institucional); nesse caso só garante is_active
  -- e vincula ao usuário se ainda não tinha dono.
  insert into public.escritorio_oabs (tenant_id, user_id, oab_number, oab_uf, is_active)
  values (p_tenant_id, p_user_id, p_oab_number, p_oab_uf, true)
  on conflict (tenant_id, oab_number, oab_uf) do update
    set is_active = true,
        user_id = coalesce(public.escritorio_oabs.user_id, excluded.user_id);

  -- 3. Libera o tenant, exceto se ele estiver suspenso manualmente.
  --    Mantém o `neq` do route original para não sobrescrever suspensões
  --    feitas pelo super_admin.
  update public.tenants
    set access_status = 'liberado'
    where id = p_tenant_id
      and access_status <> 'suspenso';
end;
$$;

comment on function public.finalize_oab_validation(uuid, uuid, text, text) is
  'Fase 4 da validação de OAB (ConfirmADV ou manual): atualiza users.oab_validated_at, registra a OAB em escritorio_oabs (achado 31/08/2026 — sem isso a OAB nunca era descoberta pelos crons) e libera tenants.access_status atomicamente.';
