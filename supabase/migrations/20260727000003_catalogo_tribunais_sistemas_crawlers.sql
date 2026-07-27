-- Catalogo global de sistemas, tribunais e adaptadores de fonte.
-- Esta etapa ainda nao altera a tabela processos.

create table if not exists public.sistemas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null unique,
  versao text,
  fabricante text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tribunais (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  sigla text not null unique,
  nome text not null,
  segmento text not null,
  sistema_principal_id uuid references public.sistemas(id) on delete set null,
  datajud_slug text unique,
  url_publica text,
  ativo boolean not null default true,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crawlers (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nome text not null,
  tipo_fonte text not null check (tipo_fonte in ('datajud', 'mural', 'pje_cs')),
  sistema_id uuid references public.sistemas(id) on delete set null,
  tribunal_id uuid references public.tribunais(id) on delete set null,
  versao text,
  status text not null default 'em_validacao' check (status in ('ativo', 'pausado', 'erro', 'em_validacao')),
  ultima_execucao timestamptz,
  ultima_atualizacao timestamptz,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tribunais_segmento_idx on public.tribunais(segmento);
create index if not exists tribunais_sistema_principal_idx on public.tribunais(sistema_principal_id);
create index if not exists crawlers_tribunal_idx on public.crawlers(tribunal_id);
create index if not exists crawlers_tipo_status_idx on public.crawlers(tipo_fonte, status);

insert into public.sistemas (codigo, nome, observacoes)
values
  ('pje', 'PJe', 'Processo Judicial Eletronico.'),
  ('eproc', 'EPROC', 'Sistema eproc.'),
  ('projudi', 'Projudi', 'Sistema Projudi.'),
  ('saj', 'SAJ', 'Sistema SAJ/e-SAJ.')
on conflict (codigo) do update set
  nome = excluded.nome,
  updated_at = now();

with seed(codigo, sigla, nome, segmento, sistema_codigo, datajud_slug, url_publica, observacoes) as (
values
  ('tjac', 'TJAC', 'Acre', 'estadual', 'pje', 'tjac', null, null),
  ('tjal', 'TJAL', 'Alagoas', 'estadual', 'pje', 'tjal', null, null),
  ('tjam', 'TJAM', 'Amazonas', 'estadual', 'pje', 'tjam', null, null),
  ('tjap', 'TJAP', 'Amapa', 'estadual', 'pje', 'tjap', null, null),
  ('tjba', 'TJBA', 'Bahia', 'estadual', 'pje', 'tjba', null, null),
  ('tjce', 'TJCE', 'Ceara', 'estadual', 'pje', 'tjce', null, null),
  ('tjdft', 'TJDFT', 'Distrito Federal e dos Territorios', 'estadual', 'pje', 'tjdft', null, null),
  ('tjes', 'TJES', 'Espirito Santo', 'estadual', 'pje', 'tjes', null, null),
  ('tjgo', 'TJGO', 'Goias', 'estadual', 'eproc', 'tjgo', null, null),
  ('tjma', 'TJMA', 'Maranhao', 'estadual', 'pje', 'tjma', null, null),
  ('tjmg', 'TJMG', 'Minas Gerais', 'estadual', 'pje', 'tjmg', null, null),
  ('tjms', 'TJMS', 'Mato Grosso do Sul', 'estadual', 'saj', 'tjms', null, null),
  ('tjmt', 'TJMT', 'Mato Grosso', 'estadual', 'pje', 'tjmt', null, null),
  ('tjpa', 'TJPA', 'Para', 'estadual', 'pje', 'tjpa', null, null),
  ('tjpb', 'TJPB', 'Paraiba', 'estadual', 'pje', 'tjpb', null, null),
  ('tjpe', 'TJPE', 'Pernambuco', 'estadual', 'pje', 'tjpe', null, null),
  ('tjpi', 'TJPI', 'Piaui', 'estadual', 'pje', 'tjpi', null, null),
  ('tjpr', 'TJPR', 'Parana', 'estadual', 'eproc', 'tjpr', null, null),
  ('tjrj', 'TJRJ', 'Rio de Janeiro', 'estadual', 'pje', 'tjrj', null, null),
  ('tjrn', 'TJRN', 'Rio Grande do Norte', 'estadual', 'pje', 'tjrn', null, null),
  ('tjro', 'TJRO', 'Rondonia', 'estadual', 'pje', 'tjro', null, null),
  ('tjrr', 'TJRR', 'Roraima', 'estadual', 'pje', 'tjrr', null, null),
  ('tjrs', 'TJRS', 'Rio Grande do Sul', 'estadual', 'projudi', 'tjrs', null, null),
  ('tjsc', 'TJSC', 'Santa Catarina', 'estadual', 'projudi', 'tjsc', null, null),
  ('tjse', 'TJSE', 'Sergipe', 'estadual', 'pje', 'tjse', null, null),
  ('tjsp', 'TJSP', 'Sao Paulo', 'estadual', 'saj', 'tjsp', null, null),
  ('tjto', 'TJTO', 'Tocantins', 'estadual', 'pje', 'tjto', null, null),
  ('trf1', 'TRF1', '1a Regiao', 'federal', 'pje', 'trf1', null, null),
  ('trf2', 'TRF2', '2a Regiao', 'federal', 'pje', 'trf2', null, null),
  ('trf3', 'TRF3', '3a Regiao', 'federal', 'pje', 'trf3', null, null),
  ('trf4', 'TRF4', '4a Regiao', 'federal', 'eproc', 'trf4', null, null),
  ('trf5', 'TRF5', '5a Regiao', 'federal', 'pje', 'trf5', null, null),
  ('trf6', 'TRF6', '6a Regiao', 'federal', 'pje', 'trf6', null, null),
  ('trt1', 'TRT1', 'Tribunal Regional do Trabalho da 1a Regiao', 'trabalho', 'pje', 'trt1', null, null),
  ('trt2', 'TRT2', 'Tribunal Regional do Trabalho da 2a Regiao', 'trabalho', 'pje', 'trt2', null, null),
  ('trt3', 'TRT3', 'Tribunal Regional do Trabalho da 3a Regiao', 'trabalho', 'pje', 'trt3', null, null),
  ('trt4', 'TRT4', 'Tribunal Regional do Trabalho da 4a Regiao', 'trabalho', 'pje', 'trt4', null, null),
  ('trt5', 'TRT5', 'Tribunal Regional do Trabalho da 5a Regiao', 'trabalho', 'pje', 'trt5', null, null),
  ('trt6', 'TRT6', 'Tribunal Regional do Trabalho da 6a Regiao', 'trabalho', 'pje', 'trt6', null, null),
  ('trt7', 'TRT7', 'Tribunal Regional do Trabalho da 7a Regiao', 'trabalho', 'pje', 'trt7', null, null),
  ('trt8', 'TRT8', 'Tribunal Regional do Trabalho da 8a Regiao', 'trabalho', 'pje', 'trt8', null, null),
  ('trt9', 'TRT9', 'Tribunal Regional do Trabalho da 9a Regiao', 'trabalho', 'pje', 'trt9', null, null),
  ('trt10', 'TRT10', 'Tribunal Regional do Trabalho da 10a Regiao', 'trabalho', 'pje', 'trt10', null, null),
  ('trt11', 'TRT11', 'Tribunal Regional do Trabalho da 11a Regiao', 'trabalho', 'pje', 'trt11', null, null),
  ('trt12', 'TRT12', 'Tribunal Regional do Trabalho da 12a Regiao', 'trabalho', 'pje', 'trt12', null, null),
  ('trt13', 'TRT13', 'Tribunal Regional do Trabalho da 13a Regiao', 'trabalho', 'pje', 'trt13', null, null),
  ('trt14', 'TRT14', 'Tribunal Regional do Trabalho da 14a Regiao', 'trabalho', 'pje', 'trt14', null, null),
  ('trt15', 'TRT15', 'Tribunal Regional do Trabalho da 15a Regiao', 'trabalho', 'pje', 'trt15', null, null),
  ('trt16', 'TRT16', 'Tribunal Regional do Trabalho da 16a Regiao', 'trabalho', 'pje', 'trt16', null, null),
  ('trt17', 'TRT17', 'Tribunal Regional do Trabalho da 17a Regiao', 'trabalho', 'pje', 'trt17', null, null),
  ('trt18', 'TRT18', 'Tribunal Regional do Trabalho da 18a Regiao', 'trabalho', 'pje', 'trt18', null, null),
  ('trt19', 'TRT19', 'Tribunal Regional do Trabalho da 19a Regiao', 'trabalho', 'pje', 'trt19', null, null),
  ('trt20', 'TRT20', 'Tribunal Regional do Trabalho da 20a Regiao', 'trabalho', 'pje', 'trt20', null, null),
  ('trt21', 'TRT21', 'Tribunal Regional do Trabalho da 21a Regiao', 'trabalho', 'pje', 'trt21', null, null),
  ('trt22', 'TRT22', 'Tribunal Regional do Trabalho da 22a Regiao', 'trabalho', 'pje', 'trt22', null, null),
  ('trt23', 'TRT23', 'Tribunal Regional do Trabalho da 23a Regiao', 'trabalho', 'pje', 'trt23', null, null),
  ('trt24', 'TRT24', 'Tribunal Regional do Trabalho da 24a Regiao', 'trabalho', 'pje', 'trt24', null, null),
  ('stf', 'STF', 'Supremo Tribunal Federal', 'superior', null, 'stf', null, null),
  ('stj', 'STJ', 'Superior Tribunal de Justica', 'superior', null, 'stj', null, null),
  ('tse', 'TSE', 'Tribunal Superior Eleitoral', 'superior', null, 'tse', null, null),
  ('stm', 'STM', 'Superior Tribunal Militar', 'superior', null, 'stm', null, null),
  ('tst', 'TST', 'Tribunal Superior do Trabalho', 'superior', 'pje', 'tst', null, null),
  ('tre-ac', 'TRE-AC', 'Tribunal Regional Eleitoral de Acre', 'eleitoral', null, 'tre-ac', null, null),
  ('tre-al', 'TRE-AL', 'Tribunal Regional Eleitoral de Alagoas', 'eleitoral', null, 'tre-al', null, null),
  ('tre-ap', 'TRE-AP', 'Tribunal Regional Eleitoral de Amapa', 'eleitoral', null, 'tre-ap', null, null),
  ('tre-am', 'TRE-AM', 'Tribunal Regional Eleitoral de Amazonas', 'eleitoral', null, 'tre-am', null, null),
  ('tre-ba', 'TRE-BA', 'Tribunal Regional Eleitoral de Bahia', 'eleitoral', null, 'tre-ba', null, null),
  ('tre-ce', 'TRE-CE', 'Tribunal Regional Eleitoral de Ceara', 'eleitoral', null, 'tre-ce', null, null),
  ('tre-df', 'TRE-DF', 'Tribunal Regional Eleitoral de Distrito Federal', 'eleitoral', null, 'tre-df', null, null),
  ('tre-es', 'TRE-ES', 'Tribunal Regional Eleitoral de Espirito Santo', 'eleitoral', null, 'tre-es', null, null),
  ('tre-go', 'TRE-GO', 'Tribunal Regional Eleitoral de Goias', 'eleitoral', null, 'tre-go', null, null),
  ('tre-ma', 'TRE-MA', 'Tribunal Regional Eleitoral de Maranhao', 'eleitoral', null, 'tre-ma', null, null),
  ('tre-mt', 'TRE-MT', 'Tribunal Regional Eleitoral de Mato Grosso', 'eleitoral', null, 'tre-mt', null, null),
  ('tre-ms', 'TRE-MS', 'Tribunal Regional Eleitoral de Mato Grosso do Sul', 'eleitoral', null, 'tre-ms', null, null),
  ('tre-mg', 'TRE-MG', 'Tribunal Regional Eleitoral de Minas Gerais', 'eleitoral', null, 'tre-mg', null, null),
  ('tre-pa', 'TRE-PA', 'Tribunal Regional Eleitoral de Para', 'eleitoral', null, 'tre-pa', null, null),
  ('tre-pb', 'TRE-PB', 'Tribunal Regional Eleitoral de Paraiba', 'eleitoral', null, 'tre-pb', null, null),
  ('tre-pr', 'TRE-PR', 'Tribunal Regional Eleitoral de Parana', 'eleitoral', null, 'tre-pr', null, null),
  ('tre-pe', 'TRE-PE', 'Tribunal Regional Eleitoral de Pernambuco', 'eleitoral', null, 'tre-pe', null, null),
  ('tre-pi', 'TRE-PI', 'Tribunal Regional Eleitoral de Piaui', 'eleitoral', null, 'tre-pi', null, null),
  ('tre-rj', 'TRE-RJ', 'Tribunal Regional Eleitoral de Rio de Janeiro', 'eleitoral', null, 'tre-rj', null, null),
  ('tre-rn', 'TRE-RN', 'Tribunal Regional Eleitoral de Rio Grande do Norte', 'eleitoral', null, 'tre-rn', null, null),
  ('tre-rs', 'TRE-RS', 'Tribunal Regional Eleitoral de Rio Grande do Sul', 'eleitoral', null, 'tre-rs', null, null),
  ('tre-ro', 'TRE-RO', 'Tribunal Regional Eleitoral de Rondonia', 'eleitoral', null, 'tre-ro', null, null),
  ('tre-rr', 'TRE-RR', 'Tribunal Regional Eleitoral de Roraima', 'eleitoral', null, 'tre-rr', null, null),
  ('tre-sc', 'TRE-SC', 'Tribunal Regional Eleitoral de Santa Catarina', 'eleitoral', null, 'tre-sc', null, null),
  ('tre-sp', 'TRE-SP', 'Tribunal Regional Eleitoral de Sao Paulo', 'eleitoral', null, 'tre-sp', null, null),
  ('tre-se', 'TRE-SE', 'Tribunal Regional Eleitoral de Sergipe', 'eleitoral', null, 'tre-se', null, null),
  ('tre-to', 'TRE-TO', 'Tribunal Regional Eleitoral de Tocantins', 'eleitoral', null, 'tre-to', null, null),
  ('tjmmg', 'TJM-MG', 'Tribunal de Justica Militar de Minas Gerais', 'militar_estadual', null, 'tjmmg', null, null),
  ('tjmrs', 'TJM-RS', 'Tribunal de Justica Militar do Rio Grande do Sul', 'militar_estadual', null, 'tjmrs', null, null),
  ('tjmsp', 'TJM-SP', 'Tribunal de Justica Militar de Sao Paulo', 'militar_estadual', null, 'tjmsp', null, null)
)
insert into public.tribunais (codigo, sigla, nome, segmento, sistema_principal_id, datajud_slug, url_publica, observacoes)
select seed.codigo, seed.sigla, seed.nome, seed.segmento, sistemas.id, seed.datajud_slug, seed.url_publica, seed.observacoes
from seed
left join public.sistemas on sistemas.codigo = seed.sistema_codigo
on conflict (codigo) do update set
  sigla = excluded.sigla,
  nome = excluded.nome,
  segmento = excluded.segmento,
  sistema_principal_id = excluded.sistema_principal_id,
  datajud_slug = excluded.datajud_slug,
  url_publica = excluded.url_publica,
  updated_at = now();

insert into public.crawlers (codigo, nome, tipo_fonte, sistema_id, tribunal_id, versao, status, observacoes)
select 'datajud_publico', 'DataJud publico', 'datajud', null, null, '1', 'ativo',
       'Consulta publica por CNJ; nao descobre processos novos.'
where not exists (select 1 from public.crawlers where codigo = 'datajud_publico');

insert into public.crawlers (codigo, nome, tipo_fonte, sistema_id, tribunal_id, versao, status, observacoes)
select 'mural_cs', 'Mural pelo MeuJudi CS', 'mural',
       (select id from public.sistemas where codigo = 'pje'), null, '1', 'ativo',
       'Comunicacoes sincronizadas pelo MeuJudi CS pareado ao tenant.'
where not exists (select 1 from public.crawlers where codigo = 'mural_cs');

insert into public.crawlers (codigo, nome, tipo_fonte, sistema_id, tribunal_id, versao, status, observacoes)
select 'pje_trt9_cs', 'PJe TRT9 pelo MeuJudi CS', 'pje_cs',
       (select id from public.sistemas where codigo = 'pje'),
       (select id from public.tribunais where codigo = 'trt9'),
       '0.2.1', 'em_validacao',
       'Acesso privado dependente de certificado, sessao e endpoints do TRT9.'
where not exists (select 1 from public.crawlers where codigo = 'pje_trt9_cs');

alter table public.sistemas enable row level security;
alter table public.tribunais enable row level security;
alter table public.crawlers enable row level security;

drop policy if exists sistemas_authenticated_read on public.sistemas;
create policy sistemas_authenticated_read on public.sistemas
for select to authenticated
using (true);

drop policy if exists sistemas_super_admin_write on public.sistemas;
create policy sistemas_super_admin_write on public.sistemas
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists tribunais_authenticated_read on public.tribunais;
create policy tribunais_authenticated_read on public.tribunais
for select to authenticated
using (true);

drop policy if exists tribunais_super_admin_write on public.tribunais;
create policy tribunais_super_admin_write on public.tribunais
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists crawlers_authenticated_read on public.crawlers;
create policy crawlers_authenticated_read on public.crawlers
for select to authenticated
using (true);

drop policy if exists crawlers_super_admin_write on public.crawlers;
create policy crawlers_super_admin_write on public.crawlers
for all to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

comment on table public.sistemas is 'Catalogo global dos sistemas judiciais conhecidos pelo MeuJudi.';
comment on table public.tribunais is 'Catalogo global de tribunais e seus codigos de integracao.';
comment on table public.crawlers is 'Adaptadores de fonte; crawler nao implica necessariamente scraping por navegador.';
