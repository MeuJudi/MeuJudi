-- Roteamento por OAB restritiva (Parte C do docs/roadmap/
-- 26-pdpj-concorrencia-inteligente.md). Quando o PDPJ recusa um processo
-- específico ("Usuário não possui acesso ao processo X" —
-- isAcessoNegadoProcessoEspecifico), a tarefa deixa de morrer como `failed`
-- terminal quando alguma OAB validada do escritório tem acesso a esse
-- processo: ela volta pra `pending`, mas só reivindicável pelo device do
-- dono daquela OAB.

alter table public.sync_tasks
  add column required_user_id uuid references public.users(id) on delete set null,
  add column required_oab_number text,
  add column required_oab_uf text;

comment on column public.sync_tasks.required_user_id is
  'Se preenchido, só o device deste user_id pode reivindicar a tarefa via /api/cs/tasks/claim — usado quando o PDPJ só libera este processo pra uma OAB específica do escritório.';
comment on column public.sync_tasks.required_oab_number is
  'OAB (número) que tem acesso a este processo segundo processos.advogados — só pra exibição/rastreabilidade, o filtro de claim usa required_user_id.';
comment on column public.sync_tasks.required_oab_uf is
  'UF da OAB correspondente a required_oab_number.';

create index sync_tasks_required_user_idx on public.sync_tasks(required_user_id) where required_user_id is not null;
