-- Sprint 2: config de frequência de sync por tenant (ajustada manualmente até
-- existir sistema de planos/billing — mesmo padrão já usado hoje pra
-- teto_custo_ia_diario_usd) + dedupe de eventos de agenda criados por
-- pollers automáticos (DataJud/Mural), pra evitar duplicar evento se o cron
-- rodar de novo sobre o mesmo dado.

alter table public.tenants
  add column if not exists sync_config jsonb not null default
  '{"horario_inicio":8,"horario_fim":18,"intervalo_horas":2,"ativo":true}'::jsonb;

create unique index if not exists agenda_eventos_dedupe_idx
  on public.agenda_eventos(tenant_id, fonte, fonte_id)
  where fonte_id is not null;
