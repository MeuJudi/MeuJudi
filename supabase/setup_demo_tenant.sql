-- Run this once in Supabase SQL Editor to create the fixed development tenant.
-- It is intentionally idempotent.

do $$
declare
  v_user_id uuid;
  v_user_role text;
  v_vertical_id uuid;
  v_tenant_id uuid;
begin
  select id, role
    into v_user_id, v_user_role
  from public.users
  where lower(email) = lower('caioporto100@gmail.com')
  limit 1;

  if v_user_id is null then
    raise exception 'User caioporto100@gmail.com not found in public.users. Log in once before running this setup.';
  end if;

  select id
    into v_vertical_id
  from public.verticals
  where slug = 'meujudi'
  limit 1;

  if v_vertical_id is null then
    raise exception 'Vertical meujudi not found.';
  end if;

  insert into public.tenants (
    vertical_id,
    name,
    slug,
    city,
    state,
    email,
    config,
    onboarding,
    created_by
  )
  values (
    v_vertical_id,
    'Escritorio Demo MeuJudi',
    'escritorio-demo-meujudi',
    'Sao Paulo',
    'SP',
    'demo@meujudi.local',
    jsonb_build_object('demo', true, 'demo_owner_email', 'caioporto100@gmail.com'),
    jsonb_build_object('demo', true, 'completed', true),
    v_user_id
  )
  on conflict (slug) do update
    set created_by = coalesce(public.tenants.created_by, excluded.created_by),
        config = public.tenants.config || excluded.config,
        onboarding = public.tenants.onboarding || excluded.onboarding,
        updated_at = now()
  returning id into v_tenant_id;

  -- A super_admin intentionally stays above tenants.
  -- Non-super-admin test users can be linked directly as the tenant owner.
  if v_user_role <> 'super_admin' then
    update public.users
      set tenant_id = v_tenant_id,
          role = 'owner',
          is_owner = true,
          is_active = true,
          updated_at = now()
    where id = v_user_id;
  end if;

  raise notice 'Demo tenant ready: %', v_tenant_id;
end $$;

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
