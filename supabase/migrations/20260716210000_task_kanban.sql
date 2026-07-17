-- Independent task board, with configurable columns per tenant.

create table if not exists public.task_kanban_columns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  position integer not null default 0,
  color text not null default '#9a6a22' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_kanban_columns_tenant_idx
  on public.task_kanban_columns(tenant_id, is_active, position);

drop trigger if exists update_task_kanban_columns_updated_at on public.task_kanban_columns;
create trigger update_task_kanban_columns_updated_at
before update on public.task_kanban_columns
for each row execute function public.update_updated_at_column();

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  kanban_column_id uuid references public.task_kanban_columns(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text,
  priority text not null default 'media' check (priority in ('alta', 'media', 'baixa')),
  due_date date,
  responsible_id uuid references public.users(id) on delete set null,
  position integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tarefas_tenant_kanban_idx
  on public.tarefas(tenant_id, kanban_column_id, position);

drop trigger if exists update_tarefas_updated_at on public.tarefas;
create trigger update_tarefas_updated_at
before update on public.tarefas
for each row execute function public.update_updated_at_column();

alter table public.task_kanban_columns enable row level security;
alter table public.tarefas enable row level security;

create policy "task_kanban_columns_tenant_all" on public.task_kanban_columns
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "tarefas_tenant_all" on public.tarefas
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
