-- Fila persistente unificada do MeuJudi Sync (CS) — Fase 3 de
-- docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md.
--
-- Substitui a fila local em electron-store (meujudi-cs/src/main/task-queue.ts)
-- como fonte oficial de tarefas de sincronização (DataJud, Mural, PDPJ).
-- Nenhum produtor real usa esta tabela ainda — isso é Fase 4 (worker) e
-- Fases 6/7 (PDPJ, Mural). Esta migration só cria a infraestrutura.

create table public.sync_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  device_id uuid references public.cs_devices(id) on delete set null,
  parent_task_id uuid references public.sync_tasks(id) on delete cascade,

  source text not null check (source in ('datajud', 'mural', 'pdpj')),
  type text not null,
  processo_id uuid references public.processos(id) on delete set null,
  cnj text,

  status text not null default 'pending' check (status in (
    'pending', 'claimed', 'running', 'waiting_external',
    'paused_login_required', 'paused_rate_limit',
    'completed', 'completed_with_warnings', 'failed', 'cancelled'
  )),
  priority smallint not null default 5,

  cursor jsonb,
  attempt integer not null default 0,
  lease_expires_at timestamptz,
  idempotency_key text not null,

  error_code text,
  error_message text,

  counters jsonb not null default '{}'::jsonb,

  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),

  unique (tenant_id, idempotency_key)
);

comment on table public.sync_tasks is
  'Fila persistente unificada de tarefas de sincronizacao (DataJud/Mural/PDPJ) executadas pelo MeuJudi CS. Fonte oficial de progresso — ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md secao 6-7.';
comment on column public.sync_tasks.cursor is
  'Checkpoint/pagina para retomada, formato livre por source (ex: {"page": 3} ou {"nextCursor": "..."}).';
comment on column public.sync_tasks.lease_expires_at is
  'Quando um device reserva a tarefa (claim), o lease expira apos alguns minutos. Uma tarefa com lease expirado volta a ficar disponivel pra claim, mesmo sem heartbeat explicito de falha.';
comment on column public.sync_tasks.idempotency_key is
  'Evita duplicar a mesma tarefa logica (ex: "pdpj_cnj:00052456320268160000"). Unico por tenant.';

create index sync_tasks_claimable_idx on public.sync_tasks(tenant_id, priority, created_at)
  where status = 'pending';
create index sync_tasks_leased_idx on public.sync_tasks(lease_expires_at)
  where status in ('claimed', 'running');
create index sync_tasks_parent_idx on public.sync_tasks(parent_task_id)
  where parent_task_id is not null;
create index sync_tasks_device_idx on public.sync_tasks(device_id)
  where device_id is not null;
create index sync_tasks_processo_idx on public.sync_tasks(processo_id)
  where processo_id is not null;

alter table public.sync_tasks enable row level security;

-- Leitura pro tenant dono (tela de fila no Web/CS, quando existir no lado
-- do usuario autenticado). Escrita e feita só via rotas /api/cs/tasks/*
-- com createServiceClient(), autenticadas por device token — mesmo padrao
-- de cs_mural_requests.
create policy "sync_tasks_tenant_read" on public.sync_tasks
  for select to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

revoke all on public.sync_tasks from anon;
grant select on public.sync_tasks to authenticated;
