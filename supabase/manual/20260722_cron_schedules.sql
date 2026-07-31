-- SQL MANUAL — NÃO aplicado automaticamente pelo Claude, nem faz parte das
-- migrations versionadas (supabase/migrations/). Rode isso manualmente no
-- SQL Editor do Supabase depois do deploy em produção, substituindo:
--   [SEU-APP-URL]     -> URL de produção real (https://www.meujudi.com.br)
--   [CRON_SECRET]     -> o mesmo valor configurado em CRON_SECRET na Vercel
--
-- Motivo de não aplicar automaticamente: o corpo do cron.schedule guarda a
-- URL e o secret como texto literal dentro do próprio SQL — não dá pra saber
-- a URL de produção nem o secret real a partir daqui, e não convém deixar
-- isso commitado com valor de verdade.
--
-- Cobre 4 jobs: os 2 pollers novos do Sprint 2 (DataJud, Mural) e os 2 crons
-- de fila de lote que já existiam desde o Sprint 1 mas nunca tiveram nada
-- acionando eles automaticamente.
--
-- OBSOLETO (30/07/2026) — NÃO rodar mais nada deste arquivo. Os crons do
-- MeuJudi passaram a rodar via cron-job.org (serviço externo), não mais
-- via pg_cron do Supabase — decisão do Caio. Os jobs já registrados aqui
-- (poll-datajud-hourly, poll-mural-weekly, processar-fila-lote-diario,
-- coletar-resultados-lote) precisam ser removidos — ver
-- supabase/manual/20260730_remover_pg_cron_jobs.sql — e recriados no
-- painel do cron-job.org. Mantido só como referência histórica de
-- schedule/frequência de cada um.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- DataJud: dispara de hora em hora; cada tenant decide (via sync_config) se
-- é a vez dele naquela hora. Ver src/app/api/cron/poll-datajud/route.ts.
select cron.schedule(
  'poll-datajud-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/poll-datajud',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [CRON_SECRET]'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- DEPRECADO (30/07/2026) — NÃO rodar mais este bloco. /api/cron/poll-mural
-- foi removido do código (commit fc87b43: Mural bloqueia IP de datacenter,
-- Vercel não consegue consultar direto). Substituído por
-- /api/cron/solicitar-mural (cria tarefa mural_request pro MeuJudi Sync do
-- escritório executar) — ver supabase/manual/20260730_fix_cron_mural.sql
-- pra desativar o job antigo e agendar o novo.
-- select cron.schedule(
--   'poll-mural-weekly',
--   '0 6 * * 1',
--   $$
--   select net.http_post(
--     url := '[SEU-APP-URL]/api/cron/poll-mural',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer [CRON_SECRET]'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- Fila de lote (já existia desde o Sprint 1, nunca foi acionada automaticamente):
-- envia os pendentes pra Batch API 1x/dia, no fim do dia.
select cron.schedule(
  'processar-fila-lote-diario',
  '0 22 * * *',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/processar-fila-lote',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [CRON_SECRET]'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Coleta os resultados dos batches prontos, a cada 2h (Batch API pode levar até 24h).
select cron.schedule(
  'coletar-resultados-lote',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/coletar-resultados-lote',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [CRON_SECRET]'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Pra conferir os jobs agendados: select * from cron.job;
-- Pra remover um job: select cron.unschedule('nome-do-job');
