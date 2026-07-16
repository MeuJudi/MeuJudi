-- MeuJudi Web foundation functions and RLS.

create or replace function public.current_user_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select tenant_id from public.users where id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select role from public.users where id = auth.uid() and is_active = true limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role = 'super_admin'
      and tenant_id is null
      and is_active = true
  );
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_role() = 'owner';
$$;

create or replace function public.write_audit_log(
  p_action text,
  p_entity text,
  p_entity_id uuid default null,
  p_tenant_id uuid default null,
  p_category text default 'general',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_id uuid;
begin
  insert into public.audit_logs (tenant_id, user_id, action, entity, entity_id, category, metadata)
  values (coalesce(p_tenant_id, public.current_user_tenant_id()), auth.uid(), p_action, p_entity, p_entity_id, p_category, p_metadata)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.complete_tenant_onboarding(
  p_tenant_name text,
  p_user_name text,
  p_city text default null,
  p_state text default null,
  p_oab_number text default null,
  p_oab_uf text default null
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

  insert into public.tenants (vertical_id, name, slug, city, state, created_by)
  values (
    v_vertical_id,
    p_tenant_name,
    public.slugify(p_tenant_name) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
    p_city,
    upper(nullif(p_state, '')),
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
  if v_tenant_id is null or not public.is_owner() then
    raise exception 'owner_required';
  end if;

  if p_role not in ('owner', 'lawyer', 'staff') then
    raise exception 'invalid_role';
  end if;

  insert into public.tenant_invites (tenant_id, email, role, invited_by)
  values (v_tenant_id, lower(p_email), p_role, auth.uid())
  on conflict (tenant_id, lower(email)) where status = 'pending'
  do update set role = excluded.role, updated_at = now(), expires_at = now() + interval '14 days'
  returning id into v_invite_id;

  perform public.write_audit_log('invite.created', 'tenant_invites', v_invite_id, v_tenant_id, 'auth');
  return v_invite_id;
end;
$$;

revoke all on function public.current_user_tenant_id() from public;
revoke all on function public.current_user_role() from public;
revoke all on function public.is_super_admin() from public;
revoke all on function public.is_owner() from public;
revoke all on function public.write_audit_log(text, text, uuid, uuid, text, jsonb) from public;
revoke all on function public.complete_tenant_onboarding(text, text, text, text, text, text) from public;
revoke all on function public.create_tenant_invite(text, text) from public;

grant execute on function public.current_user_tenant_id() to authenticated;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.write_audit_log(text, text, uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.complete_tenant_onboarding(text, text, text, text, text, text) to authenticated;
grant execute on function public.create_tenant_invite(text, text) to authenticated;

alter table public.verticals enable row level security;
alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.tenant_invites enable row level security;
alter table public.tenant_join_requests enable row level security;
alter table public.escritorio_oabs enable row level security;
alter table public.clientes enable row level security;
alter table public.processos enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.comunicacoes_mural enable row level security;
alter table public.agenda_eventos enable row level security;
alter table public.regex_metadata enable row level security;
alter table public.public_source_events enable row level security;
alter table public.public_source_matches enable row level security;
alter table public.audit_logs enable row level security;

create policy "verticals_public_read" on public.verticals
for select to anon, authenticated
using (is_active = true and is_public = true);

create policy "verticals_super_admin_all" on public.verticals
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "tenants_same_tenant_read" on public.tenants
for select to authenticated
using (id = public.current_user_tenant_id() or public.is_super_admin());

create policy "tenants_owner_update" on public.tenants
for update to authenticated
using (id = public.current_user_tenant_id() and public.is_owner())
with check (id = public.current_user_tenant_id() and public.is_owner());

create policy "users_same_tenant_read" on public.users
for select to authenticated
using (tenant_id = public.current_user_tenant_id() or id = auth.uid() or public.is_super_admin());

create policy "users_update_own_profile" on public.users
for update to authenticated
using (id = auth.uid() and role <> 'super_admin')
with check (id = auth.uid() and role <> 'super_admin' and tenant_id = public.current_user_tenant_id());

create policy "users_owner_manage_team" on public.users
for update to authenticated
using (tenant_id = public.current_user_tenant_id() and public.is_owner() and role <> 'super_admin')
with check (tenant_id = public.current_user_tenant_id() and role in ('owner', 'lawyer', 'staff'));

create policy "tenant_invites_owner_read" on public.tenant_invites
for select to authenticated
using (tenant_id = public.current_user_tenant_id() and public.is_owner());

create policy "join_requests_insert_own" on public.tenant_join_requests
for insert to authenticated
with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email', email)));

create policy "join_requests_super_admin" on public.tenant_join_requests
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "escritorio_oabs_tenant_all" on public.escritorio_oabs
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "clientes_tenant_all" on public.clientes
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "processos_tenant_all" on public.processos
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "movimentacoes_tenant_all" on public.movimentacoes
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "comunicacoes_mural_tenant_all" on public.comunicacoes_mural
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "agenda_eventos_tenant_all" on public.agenda_eventos
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "regex_metadata_read" on public.regex_metadata
for select to authenticated
using (tenant_id is null or tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "regex_metadata_tenant_write" on public.regex_metadata
for insert to authenticated
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "public_source_events_super_admin_only" on public.public_source_events
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "public_source_matches_tenant_read" on public.public_source_matches
for select to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "audit_logs_super_admin_all" on public.audit_logs
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy "audit_logs_insert_own" on public.audit_logs
for insert to authenticated
with check (user_id = auth.uid() and (tenant_id = public.current_user_tenant_id() or tenant_id is null));

