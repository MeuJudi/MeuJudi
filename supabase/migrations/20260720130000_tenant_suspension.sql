-- Suspensao de tenant bloqueia o acesso comum sem impedir a manutencao do Super Admin.

create or replace function public.current_user_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.tenant_id
  from public.users u
  join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid()
    and u.is_active = true
    and t.is_active = true
  limit 1;
$$;

create or replace function public.current_user_tenant_is_active()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(bool_and(t.is_active), false)
  from public.users u
  join public.tenants t on t.id = u.tenant_id
  where u.id = auth.uid() and u.is_active = true;
$$;

revoke all on function public.current_user_tenant_is_active() from public;
grant execute on function public.current_user_tenant_is_active() to authenticated;
