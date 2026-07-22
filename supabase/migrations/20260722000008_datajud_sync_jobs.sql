-- Jobs persistentes de sincronização DataJud iniciados pelo painel.
create table public.datajud_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  total integer not null default 0,
  processed integer not null default 0,
  next_offset integer not null default 0,
  updated_count integer not null default 0,
  unchanged_count integer not null default 0,
  not_found_count integer not null default 0,
  error_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  heartbeat_at timestamptz
);

create unique index datajud_sync_jobs_one_active_idx
  on public.datajud_sync_jobs(tenant_id)
  where status in ('pending', 'running');

create index datajud_sync_jobs_tenant_created_idx
  on public.datajud_sync_jobs(tenant_id, created_at desc);

alter table public.datajud_sync_jobs enable row level security;

create policy "datajud_sync_jobs_tenant_select" on public.datajud_sync_jobs
  for select to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "datajud_sync_jobs_tenant_insert" on public.datajud_sync_jobs
  for insert to authenticated
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

revoke all on public.datajud_sync_jobs from anon;
grant select, insert on public.datajud_sync_jobs to authenticated;
