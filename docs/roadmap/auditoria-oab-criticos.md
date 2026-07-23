# Auditoria Fase 5 — Críticos (C)

Itens críticos da auditoria das 5 fases da validação de OAB via ConfirmADV.
**Devem ser corrigidos antes de homologação com OAB real.**

## C1 — Race no `close` handler do CS

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:215-222`

**Problema:** O `closeWindow()` seta `this.currentValidation = null` antes do evento `close` da BrowserWindow ser disparado. Quando o usuário fecha a janela, o handler `close` roda, faz `if (this.currentValidation?.id === validation.id)`, mas a comparação é sempre `false` porque `currentValidation` já foi zerado. Resultado: o report `cancelled` **nunca é enviado**. A validação fica presa em `aguardando_cs` por até 15 min até o timeout.

**Impacto:** Validação órfã no banco, ocupa índice partial unique por 15 min, retém a OAB do solicitante e exige nova tentativa.

**Correção proposta:**
1. Adicionar flag `private intentionalClose = false`
2. Em `closeWindow`, setar `intentionalClose = true` antes de chamar `window.close()`
3. No handler `close`, checar `if (!this.intentionalClose && this.currentValidation?.id === validation.id)` antes de reportar
4. Resetar `intentionalClose = false` após o `close`
5. Não usar `await` dentro do handler `close` (Electron não espera) — usar `.catch(() => undefined)` para fire-and-forget

**Critérios de aceite:**
- Usuário fecha a janela → report `cancelled` chega no Web em até 5s
- Fechamento intencional pelo CS (verified/expired/failed) não dispara `cancelled` duplicado
- Validação órfã no banco é impossível

---

## C2 — Fase 4 não é transacional

**Arquivo:** `src/app/api/cs/oab-validations/[validationId]/route.ts:105-122`

**Problema:** A atualização de `users.oab_validated_at` e `tenants.access_status` são dois `await` separados. Se o primeiro passar e o segundo falhar (constraint, RLS, timeout), o estado fica inconsistente: usuário com `oab_validated_at` preenchido, mas tenant ainda bloqueado. Pior: como o `users.update` é silencioso em falha (não tem checagem de erro), a falha é invisível.

**Impacto:** Tenant preso em `aguardando_validacao` mesmo com validação positiva no banco. Usuário não consegue acessar `/monitoramento`. Não há sinal claro de erro.

**Correção proposta:**
1. Criar stored procedure `public.finalize_oab_validation(p_user_id, p_tenant_id, p_oab_number, p_oab_uf)` em nova migration
2. A procedure faz ambos os updates dentro de um bloco `BEGIN/COMMIT`
3. Trocar os dois `await` no route.ts por uma única chamada `supabase.rpc('finalize_oab_validation', { ... })`
4. Tratar erro de RPC explicitamente (logar + retornar 500)

**Critérios de aceite:**
- Falha em qualquer um dos updates faz rollback completo
- Sucesso em ambos os updates acontece atomicamente
- Erro é reportado com status 500 e mensagem clara
- Migration `20260723000014_finalize_oab_validation_rpc.sql` aplicada

---

## C3 — Status `validada` não tratado em `/validacao-oab`

**Arquivo:** `src/app/(platform)/(tenant)/validacao-oab/page.tsx:41-43`

**Problema:** `ESTADOS_ATIVOS` contém pendente/aguardando_cs/recaptcha/aguardando_codigo/validando. `ESTADOS_TERMINAIS_NEGATIVOS` contém recusada/expirada/erro/cancelada. `validada` **não está em nenhuma das duas listas**. Resultado: quando a última solicitação está com status `validada`, tanto `solicitacaoAtiva` quanto `ultimaNegativa` são `null`, e a página mostra o `<ValidacaoForm />` em vez de um estado de sucesso. Se o tenant ainda não estiver `liberado` (por causa de C2 ou race), o usuário pode criar uma nova solicitação, o que reabre o ciclo.

**Impacto:** UX ruim após validação positiva. Risco de criar solicitação duplicada para a mesma OAB (o índice partial unique vai bloquear, mas a tela mostra um erro confuso).

**Correção proposta:**
1. Adicionar `validada` em uma nova constante `ESTADO_VALIDO_POSITIVO`
2. Adicionar variável `ultimaPositiva` no server component
3. Renderizar um card de sucesso quando `ultimaPositiva` for não-null:
   - Ícone de check verde
   - "Sua identidade profissional foi validada"
   - "Validada em DD/MM/YYYY às HH:MM"
   - Botão "Ir para o painel" → `/monitoramento`
4. Não renderizar o `<ValidacaoForm />` quando `ultimaPositiva` for não-null
5. Se por algum motivo o tenant não ficou `liberado` mas a validação está `validada`, mostrar CTA para tentar sincronizar ou chamar suporte

**Critérios de aceite:**
- Status `validada` mostra card de sucesso, não o formulário
- Botão "Ir para o painel" navega para `/monitoramento`
- Usuário não consegue criar nova solicitação para a mesma OAB a partir desta tela
- Funciona mesmo que o tenant ainda não esteja `liberado` (defesa contra C2)

---

## C4 — Partition do Electron acumula storage

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:154-180`

**Problema:** Cada validação cria uma partition com nome `confirmadv-{validationId}`. O código chama `clearStorageData()` antes de abrir e ao fechar, mas a **partition em si** continua existindo no Electron. Em um escritório com muitas validações (ex.: advogado troca de OAB várias vezes), o storage do CS vai crescendo indefinidamente.

**Impacto:** Memory leak cumulativo no disco do cliente. Após centenas de validações, o Electron pode ter centenas de partitions vazias.

**Correção proposta:**
1. Após `clearStorageData()` no `closed` event handler, chamar `electronSession.fromPartition(partition).clearCache()` e idealmente remover a partition
2. Como Electron não tem API direta para deletar partition, a alternativa é:
   - Usar uma única partition fixa `confirmadv-current` e sempre fazer `clearStorageData()` no início de cada validação
   - Isso evita o acúmulo completamente

**Critérios de aceite:**
- Apenas uma partition `confirmadv-*` existe no Electron a qualquer momento
- Storage entre validações é completamente limpo (verificável com `dir %APPDATA%/meujudi-cs/`)
- Funciona com 1 ou 1000 validações sem degradar

---
