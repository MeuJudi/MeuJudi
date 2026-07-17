-- Migration: Adicionar timezone ao users + novos parâmetros ao complete_tenant_onboarding
-- Data: 17-07-2026

-- 1. Adicionar coluna timezone na tabela users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/Sao_Paulo';

-- 2. Atualizar função complete_tenant_onboarding com novos parâmetros
create or replace function public.complete_tenant_onboarding(
  p_tenant_name text,
  p_user_name text,
  p_city text default null,
  p_state text default null,
  p_oab_number text default null,
  p_oab_uf text default null,
  p_phone text default null,
  p_cnpj text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_vertical_id uuid;
  v_tenant_id uuid;
  v_invite public.tenant_invites%rowtype;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from public.users where id = v_user_id and role = 'super_admin') then
    raise exception 'super_admin_cannot_onboard_tenant';
  end if;

  select * into v_invite
  from public.tenant_invites
  where lower(email) = v_email
    and status = 'pending'
    and expires_at > now()
  order by created_at asc
  limit 1;

  if found then
    insert into public.users (id, tenant_id, role, name, email, is_owner, accepted_terms_at)
    values (v_user_id, v_invite.tenant_id, v_invite.role, p_user_name, v_email, v_invite.role = 'owner', now())
    on conflict (id) do update
      set tenant_id = excluded.tenant_id,
          role = excluded.role,
          name = excluded.name,
          email = excluded.email,
          is_owner = excluded.is_owner,
          accepted_terms_at = coalesce(public.users.accepted_terms_at, now()),
          updated_at = now();

    update public.tenant_invites
    set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
    where id = v_invite.id;

    perform public.write_audit_log('invite.accepted', 'tenant_invites', v_invite.id, v_invite.tenant_id, 'auth');
    return v_invite.tenant_id;
  end if;

  select id into v_vertical_id from public.verticals where slug = 'meujudi';

  insert into public.tenants (vertical_id, name, slug, city, state, phone, cnpj, created_by)
  values (
    v_vertical_id,
    p_tenant_name,
    public.slugify(p_tenant_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    p_city,
    upper(nullif(p_state, '')),
    nullif(p_phone, ''),
    nullif(regexp_replace(p_cnpj, '\D', '', 'g'), ''),
    v_user_id
  )
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, role, name, email, is_owner, accepted_terms_at)
  values (v_user_id, v_tenant_id, 'owner', p_user_name, v_email, true, now())
  on conflict (id) do update
    set tenant_id = excluded.tenant_id,
        role = 'owner',
        name = excluded.name,
        email = excluded.email,
        is_owner = true,
        accepted_terms_at = coalesce(public.users.accepted_terms_at, now()),
        updated_at = now();

  if nullif(p_oab_number, '') is not null and nullif(p_oab_uf, '') is not null then
    insert into public.escritorio_oabs (tenant_id, user_id, oab_number, oab_uf, is_primary)
    values (v_tenant_id, v_user_id, regexp_replace(p_oab_number, '\D', '', 'g'), upper(p_oab_uf), true)
    on conflict do nothing;
  end if;

  perform public.write_audit_log('tenant.created', 'tenants', v_tenant_id, v_tenant_id, 'auth');
  return v_tenant_id;
end;
$$;
