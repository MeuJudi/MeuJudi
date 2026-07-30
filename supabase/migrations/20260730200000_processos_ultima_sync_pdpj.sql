-- Sincronização automática do PDPJ (3 crons) — ver
-- docs/roadmap/24-crons-sincronizacao-automatica-pdpj.md.
--
-- Sem esta coluna, os crons de reescaneio (poll-pdpj-detalhes,
-- poll-pdpj-urgentes) não têm como saber quais processos estão mais
-- desatualizados — a única data existente (`ultima_sync_pje`) é gravada
-- pela tarefa `pdpj_cnj` em si, mas nunca foi pensada pra ordenar fila de
-- reprocessamento (e a chave de dedup de `pdpj_cnj` era fixa por CNJ,
-- então nenhum processo era reprocessado mais de uma vez de qualquer jeito).

alter table public.processos add column ultima_sync_pdpj timestamptz;

comment on column public.processos.ultima_sync_pdpj is
  'Última vez que uma tarefa pdpj_cnj concluiu pra este processo (detalhe + documentos). Usado pelos crons poll-pdpj-detalhes/poll-pdpj-urgentes pra escolher, entre os processos ativos, quem está mais desatualizado (ordenação: nulls first, depois mais antigo primeiro).';

create index if not exists processos_ultima_sync_pdpj_idx
  on public.processos (tenant_id, ultima_sync_pdpj)
  where status = 'ativo';
