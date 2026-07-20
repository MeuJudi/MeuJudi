-- Fluxo separado para membros convidados, papel de estagiario e tratamento pessoal.

alter table public.users
  add column if not exists gender text not null default 'neutral';

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('owner', 'lawyer', 'intern', 'staff', 'super_admin'));

alter table public.users drop constraint if exists users_gender_check;
alter table public.users add constraint users_gender_check
  check (gender in ('masculine', 'feminine', 'neutral'));

alter table public.tenant_invites drop constraint if exists tenant_invites_role_check;
alter table public.tenant_invites add constraint tenant_invites_role_check
  check (role in ('owner', 'lawyer', 'intern', 'staff'));

create or replace function public.get_pending_tenant_invite()
returns table (invite_id uuid, tenant_id uuid, tenant_name text, role text)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null or v_email = '' then
    return;
  end if;

  return query
  select i.id, i.tenant_id, t.name, i.role
  from public.tenant_invites i
  join public.tenants t on t.id = i.tenant_id
  where lower(i.email) = v_email
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at asc
  limit 1;
end;
$$;

create or replace function public.complete_invited_member_onboarding(
  p_user_name text,
  p_phone text default null,
  p_oab_number text default null,
  p_oab_uf text default null,
  p_gender text default 'neutral'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_invite public.tenant_invites%rowtype;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if nullif(trim(p_user_name), '') is null then raise exception 'name_required'; end if;
  if p_gender not in ('masculine', 'feminine', 'neutral') then raise exception 'invalid_gender'; end if;

  select * into v_invite
  from public.tenant_invites
  where lower(email) = v_email and status = 'pending' and expires_at > now()
  order by created_at asc limit 1;

  if not found then raise exception 'invite_not_found'; end if;

  insert into public.users (id, tenant_id, role, name, email, phone, oab_number, oab_uf, gender, is_owner, accepted_terms_at)
  values (
    v_user_id, v_invite.tenant_id, v_invite.role, trim(p_user_name), v_email,
    nullif(trim(p_phone), ''), nullif(regexp_replace(p_oab_number, '\D', '', 'g'), ''),
    upper(nullif(trim(p_oab_uf), '')), p_gender, v_invite.role = 'owner', now()
  )
  on conflict (id) do update set
    tenant_id = excluded.tenant_id, role = excluded.role, name = excluded.name,
    email = excluded.email, phone = excluded.phone, oab_number = excluded.oab_number,
    oab_uf = excluded.oab_uf, gender = excluded.gender, is_owner = excluded.is_owner,
    accepted_terms_at = coalesce(public.users.accepted_terms_at, now()), updated_at = now();

  update public.tenant_invites
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_invite.id;

  perform public.write_audit_log('invite.accepted', 'tenant_invites', v_invite.id, v_invite.tenant_id, 'auth');
  return v_invite.tenant_id;
end;
$$;

revoke all on function public.get_pending_tenant_invite() from public;
revoke all on function public.complete_invited_member_onboarding(text, text, text, text, text) from public;
grant execute on function public.get_pending_tenant_invite() to authenticated;
grant execute on function public.complete_invited_member_onboarding(text, text, text, text, text) to authenticated;

-- Atualiza as funcoes existentes para aceitar estagiarios e manter a OAB pessoal
-- no cadastro do membro, sem transforma-la automaticamente em OAB institucional.
create or replace function public.create_tenant_invite(
  p_email text,
  p_role text default 'lawyer'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tenant_id uuid := public.current_user_tenant_id();
  v_invite_id uuid;
begin
  if v_tenant_id is null or not public.is_owner() then raise exception 'owner_required'; end if;
  if p_role not in ('owner', 'lawyer', 'intern', 'staff') then raise exception 'invalid_role'; end if;

  insert into public.tenant_invites (tenant_id, email, role, invited_by)
  values (v_tenant_id, lower(trim(p_email)), p_role, auth.uid())
  on conflict (tenant_id, lower(email)) where status = 'pending'
  do update set role = excluded.role, updated_at = now(), expires_at = now() + interval '14 days'
  returning id into v_invite_id;

  perform public.write_audit_log('invite.created', 'tenant_invites', v_invite_id, v_tenant_id, 'auth');
  return v_invite_id;
end;
$$;

grant execute on function public.create_tenant_invite(text, text) to authenticated;

drop policy if exists "users_owner_manage_team" on public.users;
create policy "users_owner_manage_team" on public.users
for update to authenticated
using (tenant_id = public.current_user_tenant_id() and public.is_owner() and role <> 'super_admin')
with check (tenant_id = public.current_user_tenant_id() and role in ('owner', 'lawyer', 'intern', 'staff'));

-- Recria o onboarding do escritorio sem inserir a OAB pessoal na tabela institucional.
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
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.users where id = v_user_id and role = 'super_admin') then
    raise exception 'super_admin_cannot_onboard_tenant';
  end if;

  select * into v_invite from public.tenant_invites
  where lower(email) = v_email and status = 'pending' and expires_at > now()
  order by created_at asc limit 1;

  if found then
    insert into public.users (id, tenant_id, role, name, email, phone, oab_number, oab_uf, gender, is_owner, accepted_terms_at)
    values (v_user_id, v_invite.tenant_id, v_invite.role, trim(p_user_name), v_email,
      nullif(trim(p_phone), ''), nullif(regexp_replace(p_oab_number, '\D', '', 'g'), ''),
      upper(nullif(trim(p_oab_uf), '')), 'neutral', v_invite.role = 'owner', now())
    on conflict (id) do update set tenant_id = excluded.tenant_id, role = excluded.role,
      name = excluded.name, email = excluded.email, phone = excluded.phone,
      oab_number = excluded.oab_number, oab_uf = excluded.oab_uf,
      is_owner = excluded.is_owner, accepted_terms_at = coalesce(public.users.accepted_terms_at, now()), updated_at = now();
    update public.tenant_invites set status = 'accepted', accepted_by = v_user_id, accepted_at = now() where id = v_invite.id;
    perform public.write_audit_log('invite.accepted', 'tenant_invites', v_invite.id, v_invite.tenant_id, 'auth');
    return v_invite.tenant_id;
  end if;

  select id into v_vertical_id from public.verticals where slug = 'meujudi';
  insert into public.tenants (vertical_id, name, slug, city, state, phone, cnpj, created_by)
  values (v_vertical_id, trim(p_tenant_name), public.slugify(p_tenant_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    p_city, upper(nullif(p_state, '')), nullif(p_phone, ''), nullif(regexp_replace(p_cnpj, '\D', '', 'g'), ''), v_user_id)
  returning id into v_tenant_id;

  insert into public.users (id, tenant_id, role, name, email, phone, oab_number, oab_uf, gender, is_owner, accepted_terms_at)
  values (v_user_id, v_tenant_id, 'owner', trim(p_user_name), v_email, nullif(trim(p_phone), ''),
    nullif(regexp_replace(p_oab_number, '\D', '', 'g'), ''), upper(nullif(trim(p_oab_uf), '')), 'neutral', true, now())
  on conflict (id) do update set tenant_id = excluded.tenant_id, role = 'owner', name = excluded.name,
    email = excluded.email, phone = excluded.phone, oab_number = excluded.oab_number, oab_uf = excluded.oab_uf,
    is_owner = true, accepted_terms_at = coalesce(public.users.accepted_terms_at, now()), updated_at = now();

  perform public.write_audit_log('tenant.created', 'tenants', v_tenant_id, v_tenant_id, 'auth');
  return v_tenant_id;
end;
$$;

grant execute on function public.complete_tenant_onboarding(text, text, text, text, text, text, text, text) to authenticated;
