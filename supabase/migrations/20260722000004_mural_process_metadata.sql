-- Metadados identificados em textos estruturados do Mural.
alter table public.processos
  add column if not exists magistrado_nome text,
  add column if not exists magistrado_tipo text check (magistrado_tipo in ('juiz', 'juiza', 'relator', 'desembargador', 'desembargadora', 'magistrado'));

alter table public.comunicacoes_mural
  add column if not exists magistrado_nome text,
  add column if not exists magistrado_tipo text check (magistrado_tipo in ('juiz', 'juiza', 'relator', 'desembargador', 'desembargadora', 'magistrado'));

comment on column public.processos.magistrado_nome is 'Magistrado identificado no Mural; não representa advogado ou responsável do escritório.';
comment on column public.processos.magistrado_tipo is 'Tipo do magistrado identificado no Mural.';
