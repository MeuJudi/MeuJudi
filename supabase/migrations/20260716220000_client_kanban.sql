-- Configurable CRM board for clients, independent from process and task boards.
create table if not exists public.client_kanban_columns (
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

create index if not exists client_kanban_columns_tenant_idx
  on public.client_kanban_columns(tenant_id, is_active, position);

create unique index if not exists client_kanban_default_column_name_unique
  on public.client_kanban_columns(tenant_id, name)
  where is_default = true and is_active = true;

drop trigger if exists update_client_kanban_columns_updated_at on public.client_kanban_columns;
create trigger update_client_kanban_columns_updated_at
before update on public.client_kanban_columns
for each row execute function public.update_updated_at_column();

alter table public.clientes
  add column if not exists kanban_column_id uuid references public.client_kanban_columns(id) on delete set null;

create index if not exists clientes_kanban_column_idx
  on public.clientes(tenant_id, kanban_column_id);

alter table public.client_kanban_columns enable row level security;

create policy "client_kanban_columns_tenant_all" on public.client_kanban_columns
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
