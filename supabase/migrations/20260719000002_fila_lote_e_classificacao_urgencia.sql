-- IA + Regex: fila de processamento em lote + log de classificação de
-- urgência (Parte 9 de docs/roadmap/08-implementacao/).

create table if not exists public.fila_processamento_lote (
  id uuid primary key default gen_random_uuid(),

  tenant_id uuid not null references public.tenants(id) on delete cascade,
  processo_id uuid references public.processos(id) on delete cascade,
  campo text not null check (campo in ('prazo', 'valor', 'audiencia', 'oab')),
  texto text not null,
  contexto jsonb not null default '{}'::jsonb,

  status text not null default 'pendente' check (status in ('pendente', 'enviado_batch', 'processado', 'erro')),
  batch_id_anthropic text,

  resultado jsonb,
  created_at timestamptz not null default now(),
  processado_em timestamptz
);

create index if not exists fila_lote_status_idx on public.fila_processamento_lote(status, created_at);
create index if not exists fila_lote_batch_idx on public.fila_processamento_lote(batch_id_anthropic);

alter table public.fila_processamento_lote enable row level security;

create policy "fila_lote_tenant_all" on public.fila_processamento_lote
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create table if not exists public.classificacao_urgencia_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  classificacao text not null check (classificacao in ('tempo_real', 'lote')),
  motivo text not null,

  -- Preenchido depois (manual ou por feedback do advogado), pra medir se a
  -- classificação foi acertada e recalibrar o limiar com dado real.
  foi_reclamado_como_tardio boolean,

  created_at timestamptz not null default now()
);

create index if not exists classificacao_urgencia_tenant_idx on public.classificacao_urgencia_log(tenant_id, created_at desc);

alter table public.classificacao_urgencia_log enable row level security;

create policy "classificacao_urgencia_tenant_read" on public.classificacao_urgencia_log
for select to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "classificacao_urgencia_insert" on public.classificacao_urgencia_log
for insert to authenticated
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
