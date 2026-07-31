-- SQL MANUAL — rode no SQL Editor do Supabase.
--
-- Os crons do MeuJudi rodam via cron-job.org (serviço externo), NÃO via
-- pg_cron do Supabase nem Vercel Cron — decisão do Caio (30/07/2026).
-- Isso desfaz o que foi registrado aqui por engano nesta sessão (Cron 1/2/3
-- do PDPJ + a tentativa de corrigir o Mural) e também os 4 jobs antigos de
-- 20260722_cron_schedules.sql, que aparentemente nunca deveriam ter ficado
-- aqui — todos migram pra configuração manual no cron-job.org (ver
-- instruções no chat / docs/roadmap/24-crons-sincronizacao-automatica-
-- pdpj.md).

select cron.unschedule('poll-datajud-hourly');
select cron.unschedule('poll-mural-weekly');
select cron.unschedule('processar-fila-lote-diario');
select cron.unschedule('coletar-resultados-lote');
select cron.unschedule('solicitar-pdpj-6h');
select cron.unschedule('poll-pdpj-detalhes-hourly');
select cron.unschedule('poll-pdpj-urgentes-15min');

-- Conferir que não sobrou nada: select * from cron.job;
