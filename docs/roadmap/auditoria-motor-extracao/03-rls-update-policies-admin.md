# 03 — Ações manuais do admin falham silenciosamente (falta policy de UPDATE)

> **Severidade:** 🔴 Crítica
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

O painel `/admin/motor-extracao` (Super Admin) tem 6 ações manuais
(`src/app/(super-admin)/admin/motor-extracao/actions.ts`). 5 delas fazem
`UPDATE` direto contra tabelas protegidas por RLS, usando o client normal do
usuário logado (`createClient()` de `src/lib/supabase/server.ts`, que usa a
chave `anon` + cookie de sessão — **sujeito a RLS**, diferente dos crons que
usam `createServiceClient()`).

### As policies que existem hoje em `regex_metadata`

De `supabase/migrations/20260716000010_foundation_functions_rls.sql:303-309`:
```sql
create policy "regex_metadata_read" on public.regex_metadata
for select to authenticated
using (tenant_id is null or tenant_id = public.current_user_tenant_id() or public.is_super_admin());

create policy "regex_metadata_tenant_write" on public.regex_metadata
for insert to authenticated
with check (tenant_id = public.current_user_tenant_id() or public.is_super_admin());
```

**Não existe nenhuma policy de `UPDATE`** (nem `for all`) pra `regex_metadata`
em nenhuma migration do projeto. Com RLS habilitado e sem policy de UPDATE, o
Postgres nega por padrão — mas não com um erro visível. O comando
`UPDATE ... WHERE id = X` roda, a cláusula de RLS filtra a linha, 0 linhas
batem, e o retorno é **sucesso com 0 linhas afetadas**. Nenhuma das ações
confere isso (não usam `.select().single()` nem checam `data`/`count` do
retorno), então a Server Action retorna normalmente, o log de auditoria é
gravado como se tivesse funcionado, e a UI mostra "✅ concluído".

### As 5 ações afetadas

1. **Editar regex** (`editarRegexManualmente`) — `update regex_metadata set pattern=..., flags=...` → não aplica.
2. **Forçar estado** (`forcarEstadoRegex`) — `update regex_metadata set state=...` → não aplica.
3. **Desativar / kill switch** (`desativarRegexImediatamente`) — `update regex_metadata set state='desativada'` → não aplica. **Esta é a mais grave**: é o botão de emergência pra parar um regex ruim de causar dano, e ele não desativa nada de verdade.
4. **Reverter promoção global** (`reverterPromocaoGlobal`) — `update regex_metadata set tenant_id=...` → não aplica.
5. **Ajustar teto de custo** (`ajustarTetoCustoTenant`) — `update tenants set teto_custo_ia_diario_usd=...`. Aqui existe policy de UPDATE (`tenants_owner_update`), mas ela é `using (id = current_user_tenant_id() and is_owner())`. Um `super_admin` tem `current_user_tenant_id()` retornando `null` (por definição) e não tem `role = 'owner'` — a condição nunca é verdadeira pra ele. Falha pelo mesmo motivo (0 linhas), por uma policy diferente.

### Por que "Reprocessar item" (a 6ª ação) funciona

Ela não faz `UPDATE` direto — lê `itens_revisao` (que **tem** policy `for all`
cobrindo `is_super_admin()`) e chama `extrairCampo`, cujas escritas internas
passam por funções `security definer` (`atualizar_metricas_regex`,
`check_regex_transition`) que rodam com o privilégio do dono da função,
**ignorando RLS independente de quem chamou**. É por isso que o sistema
automático (via essas RPCs, acionadas pela Central de Revisão) consegue
mudar `state`/`tenant_id` em `regex_metadata` normalmente — só as ações que
fazem `UPDATE` direto pelo client RLS-bound é que estão quebradas.

---

## Qual a solução

Duas peças, uma pra cada tabela:

### `regex_metadata` — adicionar policy de UPDATE

Só super admin deveria poder editar regex manualmente (é uma ação
administrativa de correção/kill-switch, não uma ação de tenant comum):
```sql
create policy "regex_metadata_admin_update" on public.regex_metadata
for update to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
```

### `tenants` — a policy existente não cobre super_admin

A policy `tenants_owner_update` foi desenhada pro dono do escritório editar o
próprio tenant, não pro super admin editar qualquer tenant. Duas opções:
- **Opção A (recomendada):** adicionar uma segunda policy específica pra
  super admin, sem mexer na existente:
  ```sql
  create policy "tenants_super_admin_update" on public.tenants
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
  ```
- **Opção B:** alterar a policy existente pra incluir `or is_super_admin()`
  na condição — funciona igual, mas mistura a intenção de "dono edita o
  próprio" com "admin edita qualquer um" numa policy só, o que fica mais
  difícil de auditar depois. Prefira a Opção A.

### Reforço defensivo nas Server Actions (recomendado, além do SQL)

Independente da policy corrigir o problema raiz, as 5 ações deveriam também
**checar o retorno do UPDATE** e lançar erro se `0` linhas foram afetadas —
isso garante que, se uma policy for removida/quebrada no futuro por engano,
o erro aparece na hora (na UI, como erro visível) em vez de voltar a falhar
silenciosamente. Padrão:
```ts
const { data, error } = await supabase
  .from("regex_metadata")
  .update({ state: novoEstado })
  .eq("id", regexId)
  .select("id"); // força retorno das linhas afetadas

if (error) throw new Error(error.message);
if (!data || data.length === 0) {
  throw new Error("Nenhuma linha foi atualizada — provável bloqueio de RLS ou regex não encontrado.");
}
```

---

## Como implementar

**Migration nova:** `supabase/migrations/YYYYMMDD_fix_admin_update_policies.sql`
com as duas policies acima (`regex_metadata_admin_update`,
`tenants_super_admin_update`).

**Arquivos a alterar:**
`src/app/(super-admin)/admin/motor-extracao/actions.ts` — nas 5 funções
(`editarRegexManualmente`, `forcarEstadoRegex`, `desativarRegexImediatamente`,
`reverterPromocaoGlobal`, `ajustarTetoCustoTenant`), adicionar
`.select("id")` no final da chamada e o check de `data.length === 0` descrito
acima.

**Teste de verificação:**
1. Logar como super admin, ir em `/admin/motor-extracao`.
2. Escolher um regex de teste, usar "Desativar" (kill switch).
3. Consultar `select state from regex_metadata where id = '<id>'` direto no
   banco — antes do fix, mostraria o estado antigo; depois do fix, deve
   mostrar `'desativada'`.
4. Repetir pra "Ajustar teto de custo" — confirmar que
   `tenants.teto_custo_ia_diario_usd` realmente mudou.
5. Confirmar que, se você **reverter a migration** (só pra testar o reforço
   defensivo), a Server Action agora lança um erro visível na UI em vez de
   mostrar "✅ concluído" silenciosamente.
