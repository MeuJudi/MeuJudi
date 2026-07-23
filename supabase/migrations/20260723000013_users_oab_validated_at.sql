-- Fase 4 (integração) da validação de OAB via ConfirmADV.
-- Ver docs/roadmap/validacao-oab-confirmadv-cs.md.
--
-- Marca o momento em que a OAB do usuário foi validada por uma
-- solicitação que chegou ao terminal "validada". Permite ao painel
-- distinguir "usuário tem OAB cadastrada mas nunca validou" de
-- "usuário validou a OAB em tal data". A data não substitui o
-- `accepted_terms_at` nem o gate de acesso (que vive em
-- tenants.access_status).

alter table public.users
  add column if not exists oab_validated_at timestamptz;

comment on column public.users.oab_validated_at is
  'Timestamp da última validação positiva da OAB via ConfirmADV. NULL até o responsável validar pela primeira vez.';

-- Backfill opcional: se a OAB já existia antes desta coluna, não
-- marcamos como validada retroativamente — a confirmação só conta
-- depois desta migration. Assim mantemos o significado de "validado
-- pelo ConfirmADV" sem inflar a confiança em cadastros antigos.
