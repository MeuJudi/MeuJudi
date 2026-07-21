-- Sprint 2: sugestão de vínculo cliente<->processo. Quando o Mural descobre
-- um processo novo, o nome de cada parte é comparado (via pg_trgm) contra os
-- clientes já cadastrados do tenant. Toda sugestão exige confirmação humana
-- (nunca vincula/cria sozinho) — nome não é identificador único.

create extension if not exists pg_trgm;

create table public.sugestoes_vinculo_cliente (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  nome_detectado text not null,
  polo text not null check (polo in ('autor','reu')),
  cliente_id_sugerido uuid references public.clientes(id) on delete set null,
  similaridade numeric(4,3),
  tipo text not null check (tipo in ('vincular_existente','criar_novo')),
  status text not null default 'pendente' check (status in ('pendente','aceito','rejeitado')),
  decidido_por uuid references public.users(id),
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  unique (processo_id, nome_detectado)
);

create index sugestoes_vinculo_tenant_status_idx
  on public.sugestoes_vinculo_cliente(tenant_id, status, created_at desc);

alter table public.sugestoes_vinculo_cliente enable row level security;

create policy "sugestoes_vinculo_tenant_all" on public.sugestoes_vinculo_cliente
  for all to authenticated
  using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

-- Retorna o cliente mais parecido (por nome, trigram) daquele tenant, se houver.
create or replace function public.buscar_cliente_similar(p_tenant_id uuid, p_nome text)
returns table(cliente_id uuid, nome text, similaridade real)
language sql stable
as $$
  select id, name, similarity(name, p_nome) as sim
  from public.clientes
  where tenant_id = p_tenant_id
  order by sim desc
  limit 1;
$$;
