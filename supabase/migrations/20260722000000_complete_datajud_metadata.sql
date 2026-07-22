-- Completa os campos de metadados disponiveis na API Publica do DataJud.
-- Nao adiciona partes ou advogados: esses dados nao fazem parte do contrato
-- documentado da API Publica e continuam vindo do Mural/PJe/manual.

alter table public.processos
  add column if not exists data_ajuizamento timestamptz,
  add column if not exists formato_codigo integer,
  add column if not exists formato_nome text,
  add column if not exists orgao_julgador_codigo integer,
  add column if not exists orgao_julgador_municipio_ibge integer;

alter table public.movimentacoes
  add column if not exists orgao_julgador text,
  add column if not exists orgao_julgador_codigo integer;

comment on column public.processos.data_ajuizamento is 'Data de ajuizamento informada pelo DataJud.';
comment on column public.processos.formato_nome is 'Formato do processo informado pelo DataJud, como fisico ou eletronico.';
comment on column public.processos.orgao_julgador_municipio_ibge is 'Codigo IBGE do municipio do orgao julgador informado pelo DataJud.';
comment on column public.movimentacoes.orgao_julgador is 'Orgao julgador da movimentacao informado pelo DataJud.';
