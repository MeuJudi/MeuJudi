-- Allow platform super admins to create tenants from controlled admin/dev flows.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'tenants'
      and policyname = 'tenants_super_admin_insert'
  ) then
    create policy "tenants_super_admin_insert" on public.tenants
    for insert to authenticated
    with check (public.is_super_admin());
  end if;
end $$;
