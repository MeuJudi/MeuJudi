-- Extensão de processo_documentos para suportar extração de texto (decisão
-- de 29/07/2026, ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md):
-- confirmamos via captura de tráfego real do Portal PDPJ que cada documento
-- expõe `hrefTexto` ao lado de `hrefBinario` — o CS busca só o texto (nunca
-- o PDF/binário) e manda pro Web, que roda o Regex de
-- src/lib/regex/pdpj-documentos.ts e aplica prazo/dados estruturados.
--
-- O texto bruto é transitório: fica na coluna só até o Regex rodar na mesma
-- requisição que grava a linha, depois é apagado (texto = null) — só a
-- extração estruturada (jsonb, evidências curtas) permanece.

alter table public.processo_documentos
  add column if not exists nome text,
  add column if not exists tipo text,
  add column if not exists data_juntada timestamptz,
  add column if not exists texto text,
  add column if not exists extracao jsonb,
  add column if not exists processado_em timestamptz;

comment on column public.processo_documentos.texto is
  'Texto extraído do documento via hrefTexto do PDPJ (nunca o PDF/binário) — transitório: apagado (null) depois que o Regex roda, na mesma requisição que grava a linha.';
comment on column public.processo_documentos.extracao is
  'Resultado estruturado do Regex (src/lib/regex/pdpj-documentos.ts) rodado sobre o texto: tipo, classe, assunto, valor, órgão, magistrado, partes, prazos e audiências (evidência curta, não o texto integral).';
