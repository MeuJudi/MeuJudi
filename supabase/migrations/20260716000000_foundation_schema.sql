-- MeuJudi Web foundation schema.
-- Target project: meujudi-prod.

create extension if not exists pgcrypto;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(value, '')), '[^a-z0-9]+', '-', 'g'));
$$;

create table public.verticals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z][a-z0-9-]*$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  is_public boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger update_verticals_updated_at
before update on public.verticals
for each row execute function public.update_updated_at_column();

insert into public.verticals (slug, name, description, is_active, is_public, features)
values
  ('meujudi', 'MeuJudi', 'Gestao de processos juridicos para escritorios de advocacia', true, true, '["datajud","mural","ia_regex","cert_service"]'::jsonb),
  ('game', 'Game', 'Vertical futura inativa', false, false, '[]'::jsonb),
  ('novo', 'Novo', 'Template futuro de vertical', false, false, '[]'::jsonb)
on conflict (slug) do nothing;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  vertical_id uuid not null references public.verticals(id),
  name text not null,
  slug text not null unique,
  cnpj text,
  city text,
  state text,
  phone text,
  email text,
  logo_url text,
  config jsonb not null default '{}'::jsonb,
  onboarding jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  is_free_mvp boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tenants_vertical_idx on public.tenants(vertical_id);
create trigger update_tenants_updated_at
before update on public.tenants
for each row execute function public.update_updated_at_column();

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete set null,
  role text not null default 'lawyer' check (role in ('owner', 'lawyer', 'staff', 'super_admin')),
  name text not null,
  email text not null,
  phone text,
  avatar_url text,
  oab_number text,
  oab_uf text,
  is_active boolean not null default true,
  is_owner boolean not null default false,
  accepted_terms_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_super_admin_manual_check check (
    role <> 'super_admin' or tenant_id is null
  )
);

create unique index users_email_key on public.users (lower(email));
create index users_tenant_idx on public.users(tenant_id);
create trigger update_users_updated_at
before update on public.users
for each row execute function public.update_updated_at_column();

create table public.tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  email text not null,
  role text not null default 'lawyer' check (role in ('owner', 'lawyer', 'staff')),
  invited_by uuid references public.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index tenant_invites_pending_email_idx
on public.tenant_invites (tenant_id, lower(email))
where status = 'pending';

create trigger update_tenant_invites_updated_at
before update on public.tenant_invites
for each row execute function public.update_updated_at_column();

create table public.tenant_join_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requester_name text not null,
  office_hint text,
  message text,
  status text not null default 'pending' check (status in ('pending', 'invited', 'closed')),
  created_at timestamptz not null default now()
);

create table public.escritorio_oabs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  oab_number text not null check (oab_number ~ '^[0-9]+$'),
  oab_uf text not null check (length(oab_uf) = 2),
  is_primary boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, oab_number, oab_uf)
);

create index escritorio_oabs_lookup_idx on public.escritorio_oabs(oab_number, oab_uf);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  document text,
  document_hash text,
  email text,
  phone text,
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clientes_tenant_idx on public.clientes(tenant_id);
create trigger update_clientes_updated_at
before update on public.clientes
for each row execute function public.update_updated_at_column();

create table public.processos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  cnj text not null check (cnj ~ '^[0-9]{20}$'),
  tribunal text,
  grau text,
  sistema text,
  classe_codigo integer,
  classe_nome text,
  assuntos jsonb not null default '[]'::jsonb,
  nivel_sigilo integer not null default 0 check (nivel_sigilo >= 0),
  orgao_julgador text,
  autor text,
  reu text,
  advogados jsonb not null default '[]'::jsonb,
  valor_causa numeric(15, 2),
  prazo_proxima_resposta date,
  proxima_audiencia timestamptz,
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'arquivado', 'concluido')),
  tags text[] not null default '{}',
  responsavel_id uuid references public.users(id),
  is_favorito boolean not null default false,
  ultima_sync_datajud timestamptz,
  ultima_sync_mural timestamptz,
  ultima_sync_pje timestamptz,
  data_ultima_movimentacao timestamptz,
  source_context text not null default 'tenant' check (source_context in ('tenant', 'public', 'private_cs')),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cnj)
);

create index processos_tenant_idx on public.processos(tenant_id);
create index processos_cnj_idx on public.processos(cnj);
create index processos_tags_idx on public.processos using gin(tags);
create trigger update_processos_updated_at
before update on public.processos
for each row execute function public.update_updated_at_column();

create table public.movimentacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  data_movimento timestamptz not null,
  codigo integer,
  nome text not null,
  texto_completo text,
  complementos jsonb not null default '[]'::jsonb,
  fonte text not null default 'datajud' check (fonte in ('datajud', 'mural', 'pje', 'manual')),
  fonte_id text,
  prazo_dias integer,
  prazo_horas integer,
  prazo_fatal date,
  is_novo boolean not null default true,
  visto_por uuid references public.users(id),
  visto_em timestamptz,
  created_at timestamptz not null default now()
);

create index movimentacoes_tenant_idx on public.movimentacoes(tenant_id);
create index movimentacoes_processo_idx on public.movimentacoes(processo_id, data_movimento desc);
create unique index movimentacoes_dedupe_idx
on public.movimentacoes(processo_id, data_movimento, coalesce(codigo, 0), nome);

create table public.comunicacoes_mural (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete set null,
  mural_id bigint not null,
  data_disponibilizacao date not null,
  sigla_tribunal text not null,
  tipo_comunicacao text not null,
  nome_orgao text,
  texto text not null,
  meio text,
  link_processo text,
  destinatarios jsonb not null default '[]'::jsonb,
  advogados jsonb not null default '[]'::jsonb,
  prazo_dias integer,
  prazo_horas integer,
  data_prazo_fatal date,
  data_audiencia timestamptz,
  valor_causa_extraido numeric(15, 2),
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, mural_id)
);

create index comunicacoes_mural_tenant_idx on public.comunicacoes_mural(tenant_id);
create index comunicacoes_mural_mural_id_idx on public.comunicacoes_mural(mural_id);

create table public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  tipo text not null check (tipo in ('audiencia', 'prazo', 'reuniao', 'outro')),
  titulo text not null,
  descricao text,
  data_inicio timestamptz not null,
  data_fim timestamptz,
  all_day boolean not null default false,
  fonte text not null default 'manual' check (fonte in ('mural', 'datajud', 'pje', 'manual')),
  fonte_id text,
  status text not null default 'pendente' check (status in ('pendente', 'concluido', 'cancelado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agenda_tenant_data_idx on public.agenda_eventos(tenant_id, data_inicio);
create trigger update_agenda_eventos_updated_at
before update on public.agenda_eventos
for each row execute function public.update_updated_at_column();

create table public.regex_metadata (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  name text not null,
  description text,
  pattern text not null,
  flags text not null default 'i',
  state text not null default 'novo' check (state in ('novo', 'quente', 'confiavel', 'desativada')),
  total_uses integer not null default 0,
  total_hits integer not null default 0,
  total_errors integer not null default 0,
  created_by text not null default 'sistema',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index regex_metadata_tenant_idx on public.regex_metadata(tenant_id);
create trigger update_regex_metadata_updated_at
before update on public.regex_metadata
for each row execute function public.update_updated_at_column();

insert into public.regex_metadata (name, description, pattern, state, created_by)
values
  ('prazo_dias_explicito', 'Captura prazo em dias', 'Prazo:?\\s+(\\d+)\\s+dias?', 'confiavel', 'seed'),
  ('prazo_horas', 'Captura prazo em horas', 'em\\s+(\\d+)\\s+horas?', 'quente', 'seed'),
  ('valor_causa', 'Captura valor da causa', '[Vv]alor\\s+da\\s+Causa:?\\s+R\\$\\s*([\\d.,]+)', 'quente', 'seed')
on conflict do nothing;

create table public.public_source_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('datajud', 'mural', 'diario')),
  source_key text not null,
  source_hash text not null,
  payload jsonb not null,
  raw_text text,
  status text not null default 'pending' check (status in ('pending', 'matched', 'discarded')),
  fetched_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source, source_key, source_hash)
);

create table public.public_source_matches (
  id uuid primary key default gen_random_uuid(),
  source_event_id uuid not null references public.public_source_events(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  match_type text not null check (match_type in ('cnj', 'oab')),
  match_value text not null,
  created_at timestamptz not null default now(),
  unique (source_event_id, tenant_id, match_type, match_value)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  category text not null default 'general',
  severity text not null default 'info',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_idx on public.audit_logs(tenant_id, created_at desc);
create index audit_logs_user_idx on public.audit_logs(user_id, created_at desc);
