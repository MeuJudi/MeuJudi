-- S4 — auditoria: índice em users(oab_validated_at) para queries
-- que filtram "usuários validados vs não validados" (ex.: badge no
-- painel admin, métricas de cobertura).
--
-- O índice é parcial (apenas onde o valor não é null) porque a
-- maioria dos usuários nunca vai validar — não faz sentido indexar
-- todos os NULLs.
--
-- Ver docs/roadmap/validacao-oab-confirmadv-cs.md.

create index if not exists users_oab_validated_at_idx
  on public.users (oab_validated_at)
  where oab_validated_at is not null;
