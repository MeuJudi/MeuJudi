-- IA + Regex: Golden Dataset + rastreamento de extrações sem regex (Parte 6
-- de docs/roadmap/08-implementacao/).

-- =============================================
-- GAP DE SCHEMA ACHADO IMPLEMENTANDO A PARTE 6: `regex_metadata` não tinha
-- coluna `campo` (prazo/valor/audiencia/oab). A engine (Parte 3) buscava
-- TODAS as regex ativas pra qualquer campo e confiava só no padrão em si
-- pra não casar por engano — funciona na prática, mas é frágil e impede o
-- golden dataset de saber quais casos de teste aplicar a qual regex.
-- =============================================
alter table public.regex_metadata
  add column if not exists campo text check (campo in ('prazo', 'valor', 'audiencia', 'oab'));

update public.regex_metadata set campo = 'prazo' where name in ('prazo_dias_explicito', 'prazo_horas') and campo is null;
update public.regex_metadata set campo = 'valor' where name = 'valor_causa' and campo is null;

create index if not exists regex_metadata_campo_idx on public.regex_metadata(campo);

-- =============================================
-- GOLDEN DATASET — casos de teste fixos que toda regex precisa passar
-- antes de virar 'confiavel'. Cresce organicamente: toda armadilha real
-- encontrada em produção, ou correção humana (Parte 7), vira caso aqui.
-- =============================================
create table if not exists public.golden_dataset_casos (
  id uuid primary key default gen_random_uuid(),

  campo text not null check (campo in ('prazo', 'valor', 'audiencia', 'oab')),
  tipo_caso text not null check (tipo_caso in ('ancora', 'armadilha', 'correcao_humana')),

  texto text not null,
  resultado_esperado jsonb,
  deveria_casar boolean not null,

  origem text,
  created_at timestamptz not null default now()
);

create index if not exists golden_dataset_campo_idx on public.golden_dataset_casos(campo);

insert into public.golden_dataset_casos (campo, tipo_caso, texto, resultado_esperado, deveria_casar, origem) values
  ('prazo', 'ancora', 'Prazo: 15 dias para manifestação', '{"prazo_dias": 15}', true, 'seed_inicial'),
  ('prazo', 'armadilha', 'O prazo processual é regido pelo art. 15 dias contados em dobro', null, false, 'seed_inicial'),
  ('valor', 'ancora', 'Valor da Causa: R$ 15.000,00', '{"valor": 15000.00}', true, 'seed_inicial'),
  ('valor', 'armadilha', 'Processo distribuído há 15.000 dias', null, false, 'seed_inicial')
on conflict do nothing;

alter table public.golden_dataset_casos enable row level security;

create policy "golden_dataset_read_authenticated" on public.golden_dataset_casos
for select to authenticated
using (true);

create policy "golden_dataset_super_admin_write" on public.golden_dataset_casos
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- =============================================
-- Novo tipo de evento no log do motor: extração resolvida pela Camada 4
-- (IA generalista) SEM nenhum regex ter batido. É o sinal que a Camada 5
-- (auto-correção) usa pra saber quando vale a pena gerar um regex novo —
-- não dá pra usar `regex_historico_validacoes` pra isso porque `regex_id`
-- lá é NOT NULL (toda linha é validação DE uma regex específica).
-- =============================================
alter table public.motor_extracao_log drop constraint if exists motor_extracao_log_tipo_check;
alter table public.motor_extracao_log add constraint motor_extracao_log_tipo_check
  check (tipo in (
    'regex_criada',
    'mudanca_estado',
    'promocao_global',
    'reversao_promocao_global',
    'teto_atingido',
    'correcao_humana',
    'erro',
    'acao_manual_admin',
    'ia_generalista_sem_regex'
  ));
