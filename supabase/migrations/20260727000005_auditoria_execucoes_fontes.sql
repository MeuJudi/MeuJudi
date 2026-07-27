-- Fase 4: auditoria central das execucoes de DataJud, Mural e PJe/CS.
-- Registros antigos continuam validos; run_id e opcional nos logs legados.

create table if not exists public.source_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  crawler_id uuid not null references public.crawlers(id) on delete restrict,
  tribunal_id uuid references public.tribunais(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  attempt_count integer not null default 0,
  items_read integer not null default 0,
  items_created integer not null default 0,
  items_updated integer not null default 0,
  items_discarded integer not null default 0,
  last_error text,
  last_success_at timestamptz,
  app_version text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_sync_runs_status_check
    check (status in ('pending', 'running', 'completed', 'partial', 'failed', 'cancelled')),
  constraint source_sync_runs_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint source_sync_runs_attempts_check
    check (attempt_count >= 0),
  constraint source_sync_runs_items_check
    check (items_read >= 0 and items_created >= 0 and items_updated >= 0 and items_discarded >= 0)
);

create index if not exists source_sync_runs_crawler_started_idx
  on public.source_sync_runs(crawler_id, started_at desc);
create index if not exists source_sync_runs_tribunal_started_idx
  on public.source_sync_runs(tribunal_id, started_at desc);
create index if not exists source_sync_runs_tenant_started_idx
  on public.source_sync_runs(tenant_id, started_at desc);
create index if not exists source_sync_runs_status_started_idx
  on public.source_sync_runs(status, started_at desc);

alter table public.motor_extracao_log
  add column if not exists run_id uuid;

alter table public.datajud_sync_jobs
  add column if not exists run_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.motor_extracao_log'::regclass
      and conname = 'motor_extracao_log_run_id_fkey'
  ) then
    alter table public.motor_extracao_log
      add constraint motor_extracao_log_run_id_fkey
      foreign key (run_id) references public.source_sync_runs(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.datajud_sync_jobs'::regclass
      and conname = 'datajud_sync_jobs_run_id_fkey'
  ) then
    alter table public.datajud_sync_jobs
      add constraint datajud_sync_jobs_run_id_fkey
      foreign key (run_id) references public.source_sync_runs(id) on delete set null;
  end if;
end $$;

create index if not exists motor_extracao_log_run_idx
  on public.motor_extracao_log(run_id, created_at desc);
create index if not exists datajud_sync_jobs_run_idx
  on public.datajud_sync_jobs(run_id, created_at desc);

alter table public.source_sync_runs enable row level security;

drop policy if exists source_sync_runs_super_admin_read on public.source_sync_runs;
create policy source_sync_runs_super_admin_read on public.source_sync_runs
for select to authenticated
using (public.is_super_admin());

drop policy if exists source_sync_runs_tenant_read on public.source_sync_runs;
create policy source_sync_runs_tenant_read on public.source_sync_runs
for select to authenticated
using (tenant_id is not null and tenant_id = public.current_user_tenant_id());

drop policy if exists source_sync_runs_service_write on public.source_sync_runs;
create policy source_sync_runs_service_write on public.source_sync_runs
for all to service_role
using (true)
with check (true);

revoke all on public.source_sync_runs from anon;
grant select on public.source_sync_runs to authenticated;

comment on table public.source_sync_runs is
  'Uma linha por execucao de um adaptador de fonte, usada para auditoria e monitoramento.';
comment on column public.source_sync_runs.id is
  'run_id que deve ser propagado para logs do Web, do CS e do banco.';
comment on column public.source_sync_runs.metadata is
  'Metadados operacionais sem secrets, tokens, cookies, certificados ou chaves.';
comment on column public.motor_extracao_log.run_id is
  'Execucao de fonte relacionada, quando o evento pertence a um poller.';
comment on column public.datajud_sync_jobs.run_id is
  'Execucao de fonte relacionada ao job persistente do DataJud.';
