-- Agrupamento visual da fila do CS (tela "Fila de tarefas") — ver conversa
-- 31/07/2026. Sem isso, uma execução de cron que cria centenas de tarefas
-- de uma vez (ex.: poll-pdpj-detalhes) aparece como uma lista solta de
-- linhas idênticas, sem noção de progresso do lote inteiro.

alter table public.sync_tasks add column batch_id uuid;

comment on column public.sync_tasks.batch_id is
  'Agrupa tarefas criadas juntas na mesma execução de um cron (ex.: as N tarefas pdpj_cnj de um poll-pdpj-detalhes) — só pra exibição agrupada na Fila do CS, não afeta claim/processamento. Tarefas-filha de pdpj_oab (que já têm parent_task_id) não precisam disso — o agrupamento usa coalesce(batch_id, parent_task_id, id) como chave.';

create index sync_tasks_batch_idx on public.sync_tasks (tenant_id, batch_id)
  where batch_id is not null;

-- Resumo agregado por lote, usado pela tela "Fila de tarefas" do CS
-- (GET /api/cs/tasks/batches) — evita montar GROUP BY na mão via
-- PostgREST, que não suporta agregação arbitrária.
create or replace function public.sync_tasks_batches(p_tenant_id uuid)
returns table (
  batch_key uuid,
  source text,
  type text,
  total bigint,
  done bigint,
  failed bigint,
  paused bigint,
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
    min(created_at) as created_at
  from public.sync_tasks
  where tenant_id = p_tenant_id
  group by 1, 2, 3
  order by created_at desc
  limit 50;
$$;

revoke all on function public.sync_tasks_batches(uuid) from public, anon, authenticated;
grant execute on function public.sync_tasks_batches(uuid) to service_role;
