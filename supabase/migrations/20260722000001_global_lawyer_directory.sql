-- Diretório mínimo para resolver advogados identificados por OAB/UF.
-- Não expor esta tabela pela API: a resolução acontece no servidor, depois
-- que o processo já foi autorizado pelo RLS do tenant atual.
create table if not exists public.lawyers_directory (
  id uuid primary key default gen_random_uuid(),
  oab_number_normalized text not null check (oab_number_normalized ~ '^[0-9]+$'),
  oab_uf text not null check (length(oab_uf) = 2),
  canonical_name text,
  avatar_url text,
  avatar_source text check (avatar_source in ('meujudi_user', 'authorized_external')),
  avatar_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (oab_number_normalized, oab_uf)
);

create index if not exists lawyers_directory_oab_idx
  on public.lawyers_directory(oab_number_normalized, oab_uf);

create trigger update_lawyers_directory_updated_at
before update on public.lawyers_directory
for each row execute function public.update_updated_at_column();

alter table public.lawyers_directory enable row level security;

-- Sem policy para anon/authenticated: somente service_role e jobs internos
-- podem gravar ou consultar o diretório global.
