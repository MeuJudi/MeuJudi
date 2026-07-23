-- Fase 4 transacional: a auditoria (C2) identificou que os dois updates
-- feitos pelo route de report (users.oab_validated_at + tenants.access_status)
-- eram dois `await` separados, sem atomicidade. Se o primeiro passava e o
-- segundo falhava, ficávamos com usuário validado mas tenant bloqueado.
--
-- Esta RPC faz os dois updates num único BEGIN/COMMIT. SECURITY DEFINER
-- porque o CS chama via service role e os updates precisam ignorar RLS
-- (que já filtra pelo tenant_id, mas queremos garantir a transação no DB,
-- não na camada de aplicação).
--
-- Ver docs/roadmap/validacao-oab-confirmadv-cs.md.

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

  -- 2. Libera o tenant, exceto se ele estiver suspenso manualmente.
  --    Mantém o `neq` do route original para não sobrescrever suspensões
  --    feitas pelo super_admin.
  update public.tenants
    set access_status = 'liberado'
    where id = p_tenant_id
      and access_status <> 'suspenso';

  -- Se nenhum user foi atualizado, aborta a transação para o caller
  -- receber o erro e reverter qualquer side-effect (não há none aqui
  -- porque os updates são separados, mas mantém o invariante de
  -- "ou atualiza os dois ou nenhum").
  if not found then
    raise exception 'user_nao_encontrado_ou_tenant_diferente' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.finalize_oab_validation(uuid, uuid, text, text) is
  'Fase 4 da validação de OAB via ConfirmADV: atualiza users.oab_validated_at e tenants.access_status atomicamente. Chamado pelo CS via service role quando uma validação chega a verified.';

revoke all on function public.finalize_oab_validation(uuid, uuid, text, text) from public;
grant execute on function public.finalize_oab_validation(uuid, uuid, text, text) to service_role;
