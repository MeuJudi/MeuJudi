-- Documento PDPJ sem hrefBinario (só hrefTexto) era descartado inteiro —
-- `url` era NOT NULL em processo_documentos, e o dedup (`documentos-
-- conhecidos`) só hasheava `hrefBinario`. Resultado: todo documento sem
-- link de binário nunca era salvo (texto já baixado era jogado fora, regex
-- de prazo/audiência nunca rodava nele) E era rebuscado do zero em toda
-- sincronização do CNJ, pra sempre — achado 31/07/2026 ao investigar por
-- que o Caio via o mesmo documento sendo extraído de novo repetidamente.
--
-- `pdpj_documento_id` (coluna já existente, adicionada em
-- 20260730090000_document_fetch_requests.sql) é o identificador estável
-- certo pra isso: vem do UUID do documento no Codex do PDPJ, extraído do
-- path de hrefBinario OU hrefTexto — funciona pros dois casos, diferente
-- de url_hash que só existe quando tem hrefBinario.

-- Garante que toda linha (inclusive as antigas, se sobrou alguma sem
-- match no backfill anterior) tenha um pdpj_documento_id, pra poder virar
-- NOT NULL + chave de dedup sem perder nenhuma linha existente.
update public.processo_documentos
set pdpj_documento_id = id::text
where pdpj_documento_id is null;

alter table public.processo_documentos
  alter column pdpj_documento_id set not null;

-- `add constraint` não aceita "if not exists" no Postgres — usa um DO
-- block pra checar antes, senão reexecutar a migração (ex.: depois de um
-- erro em outra linha do script) falha aqui com "already exists".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'processo_documentos_pdpj_doc_id_unique'
  ) then
    alter table public.processo_documentos
      add constraint processo_documentos_pdpj_doc_id_unique unique (tenant_id, processo_id, pdpj_documento_id);
  end if;
end $$;

comment on column public.processo_documentos.pdpj_documento_id is
  'UUID do documento no Codex do PDPJ, extraído do path de hrefBinario OU hrefTexto — chave de dedup real (unique junto com tenant_id/processo_id), funciona mesmo pra documento sem link de binário.';

-- `url`/`url_hash` deixam de ser obrigatórios — documento só-texto (sem
-- hrefBinario) passa a ser salvo mesmo sem link de download.
alter table public.processo_documentos
  alter column url drop not null,
  alter column url_hash drop not null;
