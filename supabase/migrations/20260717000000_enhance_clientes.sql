-- Enhance clients with status, source, tags, and linking tables.

-- 1. Add new columns to clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS status text
    CHECK (status IN ('lead','contato','reuniao_agendada','proposta','fechado','perdido'))
    DEFAULT 'lead',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS oab_responsavel uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_estimado numeric(15,2),
  ADD COLUMN IF NOT EXISTS tags text[] not null default '{}';

CREATE INDEX IF NOT EXISTS clientes_status_idx ON public.clientes(tenant_id, status);

-- 2. Contact history table
create table if not exists public.cliente_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  tipo text not null check (tipo in ('ligacao','email','reuniao','nota','whatsapp','outro')),
  titulo text not null check (char_length(trim(titulo)) between 1 and 160),
  descricao text,
  created_at timestamptz not null default now()
);

create index if not exists cliente_historico_cliente_idx
  on public.cliente_historico(cliente_id, created_at desc);

-- 3. Client-Process linking table
create table if not exists public.cliente_processos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  vinculo text not null default 'autor' check (vinculo in ('autor','reu','representante','terceiro')),
  auto_vinculado boolean not null default false,
  created_at timestamptz not null default now(),
  unique(cliente_id, processo_id)
);

create index if not exists cliente_processos_cliente_idx
  on public.cliente_processos(cliente_id);

create index if not exists cliente_processos_processo_idx
  on public.cliente_processos(processo_id);

-- 4. Enable RLS
alter table public.cliente_historico enable row level security;
alter table public.cliente_processos enable row level security;

-- 5. RLS policies (same tenant isolation pattern)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cliente_historico'
      and policyname = 'cliente_historico_tenant_all'
  ) then
    create policy "cliente_historico_tenant_all" on public.cliente_historico
    for all to authenticated
    using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
    with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'cliente_processos'
      and policyname = 'cliente_processos_tenant_all'
  ) then
    create policy "cliente_processos_tenant_all" on public.cliente_processos
    for all to authenticated
    using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
    with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
  end if;
end $$;
