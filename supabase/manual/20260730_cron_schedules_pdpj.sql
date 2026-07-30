-- SQL MANUAL — NÃO aplicado automaticamente pelo Claude, nem faz parte das
-- migrations versionadas (supabase/migrations/). Rode isso manualmente no
-- SQL Editor do Supabase depois do deploy em produção, substituindo:
--   [SEU-APP-URL]     -> URL de produção real (ex: https://meujudi.vercel.app)
--   [CRON_SECRET]     -> o mesmo valor configurado em CRON_SECRET na Vercel
--
-- Cobre os 3 crons de sincronização automática do PDPJ — ver
-- docs/roadmap/24-crons-sincronizacao-automatica-pdpj.md pro desenho
-- completo de cada um.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Cron 1 — descoberta de processo novo, a cada 6h.
-- Ver src/app/api/cron/solicitar-pdpj/route.ts.
select cron.schedule(
  'solicitar-pdpj-6h',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/solicitar-pdpj',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [CRON_SECRET]'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cron 2 — reescaneio rotativo de processo já conhecido, de hora em hora
-- (a própria rota decide se está dentro da janela 9h-16h Brasília).
-- Ver src/app/api/cron/poll-pdpj-detalhes/route.ts.
select cron.schedule(
  'poll-pdpj-detalhes-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/poll-pdpj-detalhes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer [CRON_SECRET]'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Cron 3 — fila prioritária (prazo/audiência nos próximos 3 dias), a cada
-- 15min, o dia todo. Ver src/app/api/cron/poll-pdpj-urgentes/route.ts.
select cron.schedule(
  'poll-pdpj-urgentes-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := '[SEU-APP-URL]/api/cron/poll-pdpj-urgentes',
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
