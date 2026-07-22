-- Solicitações pontuais do Web para consultas do Mural executadas pelo CS local.
create table public.cs_mural_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  process_id uuid not null references public.processos(id) on delete cascade,
  requested_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  data_inicio date not null,
  data_fim date not null,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);

create index cs_mural_requests_device_poll_idx
  on public.cs_mural_requests(tenant_id, status, created_at)
  where status in ('pending', 'processing');

create index cs_mural_requests_process_idx
  on public.cs_mural_requests(process_id, created_at desc);

alter table public.cs_mural_requests enable row level security;

create policy "cs_mural_requests_tenant_select" on public.cs_mural_requests
  for select to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "cs_mural_requests_tenant_insert" on public.cs_mural_requests
  for insert to authenticated
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

revoke all on public.cs_mural_requests from anon;
grant select, insert on public.cs_mural_requests to authenticated;
