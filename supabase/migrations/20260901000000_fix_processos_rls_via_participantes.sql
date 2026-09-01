-- CRITICO, 01/09/2026 — a migration 20260830000000 (compartilhamento de
-- processos por OAB) tornou processos.tenant_id opcional/nao-autoritativo
-- (o vinculo de verdade passou a ser processo_participantes), mas nunca
-- atualizou a policy de RLS "processos_tenant_all", que ainda exige
-- tenant_id = current_user_tenant_id(). Resultado real: todo processo
-- criado pelo pipeline PDPJ/Mural desde 30/08 nasce com tenant_id NULL
-- (nunca setado no insert -- ver src/app/api/cs/sync/pdpj/route.ts) e fica
-- INVISIVEL pra qualquer usuario comum (nao-super-admin) -- confirmado:
-- hoje TODOS os 1390 processos do sistema estao com tenant_id nulo, ou
-- seja, nenhum escritorio consegue ver nenhum processo agora.
--
-- Corrige acrescentando uma segunda condicao: acesso via
-- processo_participantes, do mesmo jeito que as queries da aplicacao ja
-- usam (getProcessIdsForTenant/isProcessLinkedToTenant, monitoramento,
-- relatorios). Mantem a checagem antiga por tenant_id como estava, pra
-- nao quebrar nenhum processo legado que ainda dependa so dela.

drop policy if exists "processos_tenant_all" on public.processos;
create policy "processos_tenant_all" on public.processos
for all to authenticated
using (
  tenant_id = public.current_user_tenant_id()
  or public.is_super_admin()
  or exists (
    select 1 from public.processo_participantes pp
    where pp.processo_id = processos.id
      and pp.tenant_id = public.current_user_tenant_id()
  )
)
with check (
  tenant_id = public.current_user_tenant_id()
  or public.is_super_admin()
  or exists (
    select 1 from public.processo_participantes pp
    where pp.processo_id = processos.id
      and pp.tenant_id = public.current_user_tenant_id()
  )
);
