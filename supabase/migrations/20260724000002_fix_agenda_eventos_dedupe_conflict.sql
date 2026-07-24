-- Corrige bug crítico achado em produção (24/07/2026): o índice único
-- `agenda_eventos_dedupe_idx` (migration 20260722000000) é PARCIAL (`where
-- fonte_id is not null`), mas o upsert de aplicarPrazoEncontrado/
-- aplicarAudienciaEncontrada (src/lib/prazo/aplicar-prazo.ts) usa
-- `onConflict: "tenant_id,fonte,fonte_id"` sem predicado — o Postgres exige
-- que o alvo do ON CONFLICT bata exatamente com a definição do índice,
-- incluindo o WHERE parcial. Como não bate, TODO upsert nessa tabela falha
-- com erro 42P10 ("no unique or exclusion constraint matching the ON
-- CONFLICT specification") — e como o código não checava o erro do upsert,
-- a falha era 100% silenciosa. Resultado real: `agenda_eventos` tinha
-- 1 linha só (manual) no banco inteiro, apesar de centenas de prazos/
-- audiências já terem sido extraídos com sucesso pelo motor.
--
-- A cláusula `where fonte_id is not null` era redundante pra começar: um
-- índice único comum já trata NULL como "nunca igual a NULL" (múltiplas
-- linhas com fonte_id NULL nunca conflitam entre si), então remover o
-- predicado não muda nenhum comportamento de deduplicação — só destrava o
-- ON CONFLICT.

drop index if exists public.agenda_eventos_dedupe_idx;

create unique index if not exists agenda_eventos_dedupe_idx
  on public.agenda_eventos(tenant_id, fonte, fonte_id);
