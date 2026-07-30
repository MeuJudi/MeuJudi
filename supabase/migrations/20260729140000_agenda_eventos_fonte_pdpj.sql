-- agenda_eventos.fonte ainda só aceitava ('mural', 'datajud', 'pje',
-- 'manual') — resquício de antes do rename PJe -> PDPJ. A extração de texto
-- de documentos do PDPJ (29/07/2026) passou a chamar aplicarPrazoEncontrado
-- com fonte: "pdpj", que sem essa migration seria rejeitado pela constraint.

alter table public.agenda_eventos
  drop constraint if exists agenda_eventos_fonte_check;

alter table public.agenda_eventos
  add constraint agenda_eventos_fonte_check
  check (fonte in ('mural', 'datajud', 'pje', 'pdpj', 'manual'));
