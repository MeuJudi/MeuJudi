-- Corrige bug crítico achado em produção (24/07/2026): a constraint
-- `motor_extracao_log_tipo_check` (definida na fundação do motor de IA/regex,
-- Parte 6) nunca incluiu os `tipo` usados pelos crons do Sprint 2
-- (DataJud/Mural/fila de lote), criados depois. Toda tentativa de logar o
-- fim de uma execução desses crons falha com erro 23514 ("violates check
-- constraint"), silenciosamente até hoje (o insert não tinha try/catch) —
-- por isso `motor_extracao_log` nunca teve UM registro sequer de
-- `poll_mural_finalizado`/`poll_datajud_finalizado`/
-- `coletar_resultados_lote_finalizado`, mesmo com os crons rodando e
-- processando dados de verdade. Reproduzido manualmente contra produção:
-- os 3 tipos abaixo violam a constraint atual.

alter table public.motor_extracao_log drop constraint if exists motor_extracao_log_tipo_check;
alter table public.motor_extracao_log add constraint motor_extracao_log_tipo_check
  check (tipo in (
    'regex_criada',
    'mudanca_estado',
    'promocao_global',
    'reversao_promocao_global',
    'teto_atingido',
    'correcao_humana',
    'erro',
    'acao_manual_admin',
    'ia_generalista_sem_regex',
    'poll_mural_finalizado',
    'poll_datajud_finalizado',
    'coletar_resultados_lote_finalizado'
  ));
