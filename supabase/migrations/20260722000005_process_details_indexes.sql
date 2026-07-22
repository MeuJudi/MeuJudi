-- Índices usados ao abrir o modal de detalhes do processo.
create index if not exists agenda_eventos_processo_idx
  on public.agenda_eventos(processo_id, data_inicio);

create index if not exists comunicacoes_mural_processo_idx
  on public.comunicacoes_mural(processo_id, data_disponibilizacao desc);
