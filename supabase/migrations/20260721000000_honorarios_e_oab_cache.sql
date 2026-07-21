-- Tabela de honorários advocatícios
-- Baseada na tabela da OAB (sugestão) + valores customizados por escritório

create type honorario_unidade as enum (
  'hora',
  'servico',
  'mes',
  'consulta',
  'percentual',
  'fixo'
);

create table if not exists public.honorarios_sugeridos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  categoria text not null,
  servico text not null,
  descricao text,
  unidade honorario_unidade not null default 'servico',
  valor_sugerido_oab numeric(12,2) not null,
  valor_minimo numeric(12,2),
  valor_maximo numeric(12,2),
  valor_escritorio numeric(12,2),
  base_legal text,
  ativo boolean not null default true,
  customizado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, servico)
);

create index if not exists honorarios_sugeridos_tenant_idx
  on public.honorarios_sugeridos (tenant_id);

create index if not exists honorarios_sugeridos_categoria_idx
  on public.honorarios_sugeridos (categoria);

alter table public.honorarios_sugeridos enable row level security;

drop policy if exists honorarios_sugeridos_select on public.honorarios_sugeridos;
create policy honorarios_sugeridos_select on public.honorarios_sugeridos
  for select to authenticated
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
    or (select role from public.users where id = auth.uid()) = 'super_admin'
  );

drop policy if exists honorarios_sugeridos_write on public.honorarios_sugeridos;
create policy honorarios_sugeridos_write on public.honorarios_sugeridos
  for all to authenticated
  using (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
  )
  with check (
    tenant_id = (select tenant_id from public.users where id = auth.uid())
  );

-- Trigger para updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists honorarios_sugeridos_updated on public.honorarios_sugeridos;
create trigger honorarios_sugeridos_updated
  before update on public.honorarios_sugeridos
  for each row execute function public.set_updated_at();

-- Cache da consulta na API da OAB (para evitar bater na SOAP toda vez)
create table if not exists public.oab_validations_cache (
  id uuid primary key default gen_random_uuid(),
  oab_number text not null,
  oab_uf text not null,
  nome text,
  situacao text,
  tipo_inscricao text,
  endereco text,
  cidade text,
  estado text,
  cep text,
  telefone text,
  email text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  unique (oab_number, oab_uf)
);

create index if not exists oab_validations_cache_lookup_idx
  on public.oab_validations_cache (oab_number, oab_uf);

-- RLS: todos usuários autenticados podem ler (dados públicos da OAB)
alter table public.oab_validations_cache enable row level security;

drop policy if exists oab_cache_read on public.oab_validations_cache;
create policy oab_cache_read on public.oab_validations_cache
  for select to authenticated using (true);

-- Status da OAB dos advogados do escritório
create table if not exists public.user_oab_status (
  user_id uuid primary key references public.users(id) on delete cascade,
  oab_number text not null,
  oab_uf text not null,
  nome_oficial text,
  situacao text,
  tipo_inscricao text,
  ultima_validacao timestamptz not null default now(),
  valido boolean not null default false,
  unique (oab_number, oab_uf)
);

create index if not exists user_oab_status_lookup_idx
  on public.user_oab_status (oab_number, oab_uf);

alter table public.user_oab_status enable row level security;

drop policy if exists user_oab_status_select on public.user_oab_status;
create policy user_oab_status_select on public.user_oab_status
  for select to authenticated
  using (
    user_id = auth.uid()
    or (select role from public.users where id = auth.uid()) in ('owner', 'super_admin')
  );

drop policy if exists user_oab_status_write on public.user_oab_status;
create policy user_oab_status_write on public.user_oab_status
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
