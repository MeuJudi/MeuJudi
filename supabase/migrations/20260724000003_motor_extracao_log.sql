-- Tabela de logs do motor de extração (poll-datajud, poll-mural, etc).
-- Usada pelo endpoint /api/cron/poll-datajud para registrar o resultado
-- de cada execução. Se a tabela não existir, o insert falha em silêncio
-- e a função crasha antes de enviar o response (causa do timeout no
-- cron-job.org — ver diagnóstico de 24/07/2026).

create table if not exists public.motor_extracao_log (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null,
  detalhes   jsonb,
  created_at timestamptz not null default now()
);

comment on table  public.motor_extracao_log IS 'Logs de execução do motor de extração (poll-datajud, etc).';
comment on column public.motor_extracao_log.tipo IS 'Tipo de evento: poll_datajud_finalizado, poll_mural_finalizado, etc.';
comment on column public.motor_extracao_log.detalhes IS 'JSON com estatísticas da execução (tenants_processados, processos_atualizados, erros, etc).';

-- Índice para consultas por tipo + data (dashboard de monitoramento).
create index if not exists motor_extracao_log_tipo_idx
  on public.motor_extracao_log (tipo, created_at desc);

-- RLS: apenas service_role pode escrever (via service client no cron).
-- Leitura pode ser liberada para admin depois, se necessário.
alter table public.motor_extracao_log enable row level security;

-- Service role bypasses RLS, mas deixamos explícito para clareza.
create policy "motor_extracao_log_service_insert"
  on public.motor_extracao_log
  for insert
  to service_role
  with check (true);

create policy "motor_extracao_log_service_select"
  on public.motor_extracao_log
  for select
  to service_role
  using (true);
