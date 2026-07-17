-- IA + Regex: fundação (Parte 1 de docs/roadmap/08-implementacao/).
-- Estende regex_metadata (criada em 20260716000000_foundation_schema.sql) e
-- adiciona as tabelas base pro motor de extração descrito em docs/roadmap/08-ia-regex.md.

-- =============================================
-- Extensão de regex_metadata: auditoria e versionamento
-- =============================================
alter table public.regex_metadata
  add column if not exists texto_exemplo text,
  add column if not exists ultima_validacao_ia timestamptz,
  add column if not exists versao integer not null default 1,
  add column if not exists regex_anterior text,
  add column if not exists motivo_mudanca text;

-- taxa_acerto calculada, consistente com os nomes total_uses/total_hits já existentes
alter table public.regex_metadata
  add column if not exists taxa_acerto numeric(5, 4)
    generated always as (
      case when total_uses > 0 then total_hits::numeric / total_uses else 0 end
    ) stored;

create index if not exists regex_metadata_state_idx on public.regex_metadata(state);

-- =============================================
-- Histórico de validações (IA e humano) por regex
-- Ver 08-ia-regex.md seções 5.4 (rastreamento por tribunal) e 8.1 (origem humana)
-- =============================================
create table if not exists public.regex_historico_validacoes (
  id uuid primary key default gen_random_uuid(),
  regex_id uuid not null references public.regex_metadata(id) on delete cascade,
  tenant_id uuid references public.tenants(id) on delete cascade,
  tribunal_origem text,
  texto text not null,
  match_regex text,
  match_corrigido text,
  correto boolean not null,
  origem_validacao text not null default 'ia' check (origem_validacao in ('ia', 'humano')),
  tokens_usados integer,
  custo_usd numeric(10, 6),
  created_at timestamptz not null default now()
);

create index if not exists regex_historico_regex_idx on public.regex_historico_validacoes(regex_id, created_at desc);
create index if not exists regex_historico_tenant_idx on public.regex_historico_validacoes(tenant_id);
create index if not exists regex_historico_tribunal_idx on public.regex_historico_validacoes(regex_id, tribunal_origem);
create index if not exists regex_historico_origem_idx on public.regex_historico_validacoes(origem_validacao);
create index if not exists regex_historico_incorretas_idx
  on public.regex_historico_validacoes(regex_id, correto) where correto = false;

-- =============================================
-- Cache global de extração por hash de texto (cross-tenant, de propósito)
-- Ver 08-ia-regex.md seção 4
-- =============================================
create table if not exists public.extracoes_cache (
  id uuid primary key default gen_random_uuid(),
  hash_texto text not null,
  campo text not null check (campo in ('prazo', 'valor', 'audiencia', 'oab')),
  resultado jsonb not null,
  confianca text not null check (confianca in ('alta', 'media', 'baixa')),
  regex_ou_modelo_usado text,
  total_hits integer not null default 0,
  ultimo_hit_em timestamptz,
  created_at timestamptz not null default now(),
  unique (hash_texto, campo)
);

create index if not exists extracoes_cache_hash_idx on public.extracoes_cache(hash_texto, campo);

-- =============================================
-- Log de atividade do motor (feed do Super Admin — ver Parte 10)
-- =============================================
create table if not exists public.motor_extracao_log (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'regex_criada', 'mudanca_estado', 'promocao_global', 'reversao_promocao_global',
    'teto_atingido', 'correcao_humana', 'erro', 'acao_manual_admin'
  )),
  tenant_id uuid references public.tenants(id) on delete cascade,
  tribunal_origem text,
  regex_id uuid references public.regex_metadata(id) on delete set null,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists motor_extracao_log_tipo_idx on public.motor_extracao_log(tipo, created_at desc);
create index if not exists motor_extracao_log_tenant_idx on public.motor_extracao_log(tenant_id, created_at desc);
create index if not exists motor_extracao_log_regex_idx on public.motor_extracao_log(regex_id, created_at desc);

-- =============================================
-- Teto de custo de IA por tenant + consumo diário (adiantado da Parte 8
-- pra já existir no schema desde a fundação)
-- =============================================
alter table public.tenants
  add column if not exists teto_custo_ia_diario_usd numeric(10, 2) not null default 0.60;
  -- ~R$3/dia — valor provisório único (08-ia-regex.md seção 10). Ainda não há
  -- coluna de plano/billing no schema; ajustar manualmente por tenant até
  -- o sistema de planos existir. Ver Parte 10 (painel Super Admin) pra ação manual.

create table if not exists public.consumo_ia_diario (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  data date not null default current_date,
  custo_usd_acumulado numeric(10, 4) not null default 0,
  total_chamadas integer not null default 0,
  teto_atingido boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (tenant_id, data)
);

create index if not exists consumo_ia_diario_tenant_idx on public.consumo_ia_diario(tenant_id, data desc);

-- =============================================
-- RLS
-- Nota: o cliente Supabase do app hoje (src/lib/supabase/server.ts) roda com
-- a sessão do próprio usuário (RLS ativo), não com service role. As policies
-- abaixo cobrem o uso direto da UI (Central de Revisão, Motor de Extração).
-- Jobs de background (polling, cron) que rodarem via service role bypassam
-- RLS normalmente — revisitar quando a Parte 3/8 estiverem implementadas.
-- =============================================
alter table public.regex_historico_validacoes enable row level security;
alter table public.extracoes_cache enable row level security;
alter table public.motor_extracao_log enable row level security;
alter table public.consumo_ia_diario enable row level security;

create policy "regex_historico_tenant_read" on public.regex_historico_validacoes
for select to authenticated
using (tenant_id is null or tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "regex_historico_tenant_insert" on public.regex_historico_validacoes
for insert to authenticated
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

-- extracoes_cache é global por design (mesmo texto = mesmo resultado, não
-- importa o tenant) — leitura e escrita liberadas pra qualquer autenticado,
-- já que não expõe vínculo direto com um tenant específico.
create policy "extracoes_cache_read_authenticated" on public.extracoes_cache
for select to authenticated
using (true);

create policy "extracoes_cache_write_authenticated" on public.extracoes_cache
for insert to authenticated
with check (true);

create policy "extracoes_cache_update_authenticated" on public.extracoes_cache
for update to authenticated
using (true)
with check (true);

create policy "motor_extracao_log_super_admin_read" on public.motor_extracao_log
for select to authenticated
using (public.is_super_admin());

create policy "motor_extracao_log_tenant_insert" on public.motor_extracao_log
for insert to authenticated
with check (tenant_id = public.current_user_tenant_id() or tenant_id is null or public.is_super_admin());

create policy "consumo_ia_diario_tenant_read" on public.consumo_ia_diario
for select to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "consumo_ia_diario_tenant_write" on public.consumo_ia_diario
for all to authenticated
using (tenant_id = public.current_user_tenant_id() or public.is_super_admin())
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
