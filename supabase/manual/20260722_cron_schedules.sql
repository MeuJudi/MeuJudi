-- SQL MANUAL — NÃO aplicado automaticamente pelo Claude, nem faz parte das
-- migrations versionadas (supabase/migrations/). Rode isso manualmente no
-- SQL Editor do Supabase depois do deploy em produção, substituindo:
--   [SEU-APP-URL]     -> URL de produção real (ex: https://meujudi.vercel.app)
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

-- Mural: 1x/semana, segunda 6h. Ver src/app/api/cron/poll-mural/route.ts.
select cron.schedule(
  'poll-mural-weekly',
  '0 6 * * 1',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/poll-mural',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [CRON_SECRET]'
    ),
    body := '{}'::jsonb
  );
  $$
);

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
