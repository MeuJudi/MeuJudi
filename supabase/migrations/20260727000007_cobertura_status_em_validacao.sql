-- Permite distinguir uma evidencia parcial de um teste que esta sendo executado.
alter table public.tribunal_coverage
  drop constraint if exists tribunal_coverage_status_check;

alter table public.tribunal_coverage
  add constraint tribunal_coverage_status_check
  check (status in ('nao_testado', 'em_validacao', 'parcial', 'validado', 'bloqueado'));

comment on column public.tribunal_coverage.status is
  'Estado da validacao: nao_testado, em_validacao, parcial, validado ou bloqueado.';
