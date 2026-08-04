-- "Descoberta de processo novo (OAB)" na Fila do CS hoje só mostra
-- Pendente/Concluída, sem dizer SE achou processo novo — pedido do Caio
-- (04/08/2026): quer ver direto no card se a busca daquela OAB encontrou
-- algo ou não, sem precisar abrir detalhes.
--
-- O dado já existe: handlePdpjOab (meujudi-cs/src/main/pdpj-tasks.ts) já
-- grava `counters.novos` (quantos CNJ novos aquela varredura encontrou) em
-- toda tarefa pdpj_oab ao concluir. Só faltava expor isso agregado no
-- resumo de lote.

drop function if exists public.sync_tasks_batches(uuid);

create function public.sync_tasks_batches(p_tenant_id uuid)
returns table (
  batch_key uuid,
  source text,
  type text,
  total bigint,
  done bigint,
  failed bigint,
  paused bigint,
  novos_processos bigint,
  created_at timestamptz
)
language sql
stable
as $$
  select
    coalesce(batch_id, parent_task_id, id) as batch_key,
    source,
    type,
    count(*) as total,
    count(*) filter (where status in ('completed', 'completed_with_warnings')) as done,
    count(*) filter (where status in ('failed', 'cancelled')) as failed,
    count(*) filter (where status in ('paused_login_required', 'paused_rate_limit')) as paused,
    sum(coalesce((counters->>'novos')::bigint, 0)) as novos_processos,
    min(created_at) as created_at
  from public.sync_tasks
  where tenant_id = p_tenant_id
  group by 1, 2, 3
  order by created_at desc
  limit 50;
$$;

comment on function public.sync_tasks_batches(uuid) is
  'Resumo agregado por lote pra Fila do CS. novos_processos soma counters.novos das tarefas do lote — só tem valor real pra pdpj_oab (descoberta), fica 0 pros demais tipos.';

grant execute on function public.sync_tasks_batches(uuid) to service_role;
