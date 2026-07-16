-- Rode este SQL no Supabase SQL Editor para liberar o acesso Super Admin.
-- Email alvo: caioporto100@gmail.com

insert into public.users (
  id,
  tenant_id,
  role,
  name,
  email,
  is_owner,
  is_active,
  accepted_terms_at
)
select
  au.id,
  null,
  'super_admin',
  coalesce(au.raw_user_meta_data ->> 'name', 'Caio Porto'),
  lower(au.email),
  false,
  true,
  now()
from auth.users au
where lower(au.email) = 'caioporto100@gmail.com'
on conflict (id) do update
set
  tenant_id = null,
  role = 'super_admin',
  name = coalesce(public.users.name, excluded.name),
  email = excluded.email,
  is_owner = false,
  is_active = true,
  accepted_terms_at = coalesce(public.users.accepted_terms_at, now()),
  updated_at = now();

select id, email, role, tenant_id, is_active
from public.users
where lower(email) = 'caioporto100@gmail.com';
