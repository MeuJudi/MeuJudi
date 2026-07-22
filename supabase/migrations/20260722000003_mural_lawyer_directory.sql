-- Base global para advogados encontrados no Mural.
-- OAB + UF identificam o profissional; tenant_id fica apenas na tabela de
-- ocorrencias para preservar a origem sem expor relacionamentos entre tenants.
alter table public.lawyers_directory
  add column if not exists name_variants text[] not null default '{}',
  add column if not exists tribunals text[] not null default '{}',
  add column if not exists source text not null default 'meujudi_user'
    check (source in ('mural', 'meujudi_user', 'manual', 'oab')),
  add column if not exists validation_status text not null default 'unconfirmed'
    check (validation_status in ('unconfirmed', 'confirmed', 'divergent')),
  add column if not exists official_name text,
  add column if not exists official_status text,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists mural_appearances integer not null default 0;

create index if not exists lawyers_directory_validation_idx
  on public.lawyers_directory(validation_status, last_seen_at desc);

create table if not exists public.lawyer_directory_mentions (
  id uuid primary key default gen_random_uuid(),
  lawyer_id uuid not null references public.lawyers_directory(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  mural_id bigint,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  appearances integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lawyer_id, tenant_id)
);

create index if not exists lawyer_directory_mentions_tenant_idx
  on public.lawyer_directory_mentions(tenant_id, last_seen_at desc);

create index if not exists lawyer_directory_mentions_mural_idx
  on public.lawyer_directory_mentions(mural_id);

create trigger update_lawyer_directory_mentions_updated_at
before update on public.lawyer_directory_mentions
for each row execute function public.update_updated_at_column();

alter table public.lawyer_directory_mentions enable row level security;

-- Sem policies para anon/authenticated: jobs internos usam service_role e a
-- futura tela administrativa deverá acessar por action autorizada.
