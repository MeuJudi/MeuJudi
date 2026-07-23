-- Mantem o cursor de cada fonte separado e registra como prazos/audiencias
-- foram identificados, sem misturar a linha do tempo do Mural com a do DataJud.
alter table public.processos
  add column if not exists data_ultima_movimentacao_datajud timestamptz,
  add column if not exists data_ultima_comunicacao_mural timestamptz;

alter table public.agenda_eventos
  add column if not exists extracao_origem text,
  add column if not exists extracao_confianca text,
  add column if not exists texto_origem text;

create index if not exists processos_datajud_cursor_idx
  on public.processos(tenant_id, data_ultima_movimentacao_datajud);

comment on column public.processos.data_ultima_movimentacao_datajud is
  'Cursor da ultima movimentacao processada exclusivamente pelo DataJud.';
comment on column public.processos.data_ultima_comunicacao_mural is
  'Cursor da ultima comunicacao processada exclusivamente pelo Mural.';
comment on column public.agenda_eventos.texto_origem is
  'Trecho que originou a deteccao automatica do evento.';
