-- Fase 2 (tela Web) da validação de OAB via ConfirmADV — impede que um
-- mesmo usuário tenha duas solicitações "em voo" simultâneas (corrida entre
-- abas/cliques duplos), além da checagem feita em código na Server Action.
-- Estados terminais (validada/recusada/expirada/erro/cancelada) não contam,
-- então uma nova tentativa depois de um resultado terminal sempre pode ser
-- criada.
create unique index oab_validations_active_per_user_idx
  on public.oab_validations(user_id)
  where status in ('pendente', 'aguardando_cs', 'recaptcha_em_andamento', 'aguardando_codigo', 'validando');
