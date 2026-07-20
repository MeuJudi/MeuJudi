-- Platform maintenance windows and in-app notices.

create table if not exists public.maintenance_windows (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('tenant', 'platform')),
  tenant_id uuid references public.tenants(id) on delete cascade,
  title text not null default 'Janela de manutenção',
  message text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_scope_target_check check ((scope = 'platform' and tenant_id is null) or (scope = 'tenant' and tenant_id is not null)),
  constraint maintenance_time_order_check check (ends_at > starts_at)
);

create index if not exists maintenance_windows_active_idx on public.maintenance_windows (starts_at, ends_at) where status in ('scheduled', 'active');
create index if not exists maintenance_windows_tenant_idx on public.maintenance_windows (tenant_id, starts_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  type text not null default 'general',
  title text not null,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_tenant_idx on public.notifications (tenant_id, created_at desc);

create or replace function public.update_maintenance_window_timestamp()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists maintenance_windows_updated_at on public.maintenance_windows;
create trigger maintenance_windows_updated_at before update on public.maintenance_windows for each row execute function public.update_maintenance_window_timestamp();

alter table public.maintenance_windows enable row level security;
alter table public.notifications enable row level security;

drop policy if exists maintenance_windows_read on public.maintenance_windows;
create policy maintenance_windows_read on public.maintenance_windows for select using (
  public.is_super_admin() or
  (scope = 'platform' and public.current_user_tenant_id() is not null) or
  (scope = 'tenant' and tenant_id = public.current_user_tenant_id())
);

drop policy if exists maintenance_windows_super_admin_write on public.maintenance_windows;
create policy maintenance_windows_super_admin_write on public.maintenance_windows for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select using (
  public.is_super_admin() or
  (tenant_id = public.current_user_tenant_id() and (user_id is null or user_id = auth.uid()))
);

drop policy if exists notifications_super_admin_write on public.notifications;
create policy notifications_super_admin_write on public.notifications for all using (public.is_super_admin()) with check (public.is_super_admin());

grant select, insert, update, delete on public.maintenance_windows to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

