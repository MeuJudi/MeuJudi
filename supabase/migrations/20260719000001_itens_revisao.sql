-- IA + Regex: Central de Revisão / Camada 6 (Parte 7 de docs/roadmap/08-implementacao/).

create table if not exists public.itens_revisao (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid not null references public.processos(id) on delete cascade,
  regex_id uuid references public.regex_metadata(id) on delete set null,

  campo text not null check (campo in ('prazo', 'valor', 'audiencia', 'oab')),
  tribunal_origem text,
  texto_original text not null,
  trecho_destacado text,

  valor_sugerido jsonb,
  confianca text not null check (confianca in ('media', 'baixa')),
  origem text not null,

  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'corrigido')),
  valor_final jsonb,
  revisado_por uuid references public.users(id),
  revisado_em timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists itens_revisao_tenant_status_idx on public.itens_revisao(tenant_id, status, created_at desc);
create index if not exists itens_revisao_processo_idx on public.itens_revisao(processo_id);

alter table public.itens_revisao enable row level security;

create policy "itens_revisao_tenant_all" on public.itens_revisao
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
