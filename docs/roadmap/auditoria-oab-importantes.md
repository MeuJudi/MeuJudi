# Auditoria Fase 5 — Importantes (W)

Itens importantes da auditoria — não são bugs críticos mas devem ser resolvidos
antes de produção para qualidade de código, UX e manutenibilidade.

## W1 — `attempt_count` nunca é incrementado

**Arquivo:** `supabase/migrations/20260723000010_oab_validations.sql:27`

**Problema:** O campo `attempt_count integer not null default 0` existe no schema mas nenhum código incrementa. Serve para detectar advogados que estão em loop de tentativas falhas, mas está inerte.

**Impacto:** Campo morto, polui o schema.

**Correção proposta:**
- Decidir entre duas opções:
  1. **Implementar de verdade:** incrementar `attempt_count` no server action `criarOuRetomarSolicitacaoValidacao` quando já existe solicitação em estado terminal negativo. Atual: `update oab_validations set attempt_count = attempt_count + 1 where id = ...`.
  2. **Remover do schema:** migration de cleanup `alter table oab_validations drop column attempt_count` + atualizar tipagem
- Recomendação: opção 1 (mais útil) — após exceder 3 tentativas em 24h, exibir mensagem "Muitas tentativas recentes, aguarde X minutos" e bloquear temporariamente.

**Critérios de aceite:**
- `attempt_count` é atualizado quando uma nova solicitação é criada após uma negativa
- Query `select attempt_count from oab_validations where user_id = ?` retorna valor consistente
- Se decidido remover, migration `20260723000015_drop_attempt_count.sql` aplicada e tipos atualizados

---

## W2 — Após `validada`, redireciona para `/monitoramento` em vez de mostrar sucesso

**Arquivo:** `src/app/(platform)/(tenant)/validacao-oab/page.tsx:37-39`

**Problema:** Quando o tenant é `liberado`, a página redireciona para `/monitoramento`. Mas o usuário acabou de passar por um fluxo crítico de validação — mandar ele direto para uma lista de processos sem reconhecer o sucesso é UX fraca.

**Impacto:** Usuário não percebe claramente que a validação foi concluída. Pode parecer que algo quebrou.

**Correção proposta:**
1. Quando `tenantStatus === 'liberado'`:
   - Mostrar card de sucesso com animação (checkmark animado, confete opcional)
   - Texto: "Identidade profissional validada"
   - Subtexto: "Validação concluída em DD/MM/YYYY às HH:MM. O acesso ao MeuJudi está liberado."
   - 2 botões: "Ir para o painel" (primário) e "Voltar para configurações" (secundário)
2. Remover o redirect automático — deixar o usuário escolher
3. Aplicar a correção **antes** de C3, porque C3 trata o caso da solicitação estar `validada` mas o tenant ainda não

**Critérios de aceite:**
- Tenant `liberado` mostra card de sucesso, não redireciona
- Botão "Ir para o painel" leva a `/monitoramento`
- Card mostra o timestamp da validação

---

## W3 — `CONFIRMADV_BASE` importado mas não usado

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:23`

**Problema:** Importação morta.

**Correção proposta:**
- Remover `CONFIRMADV_BASE` do import. A constante só é usada em `confirmadv-helpers.ts`.

**Critérios de aceite:**
- `tsc --noEmit` continua passando
- ESLint (quando configurado) não reclama de import não usado

---

## W4 — Tipo `ConfirmADVEventHint` duplicado

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:45-51`

**Problema:** O tipo é re-exportado do `confirmadv-helpers` (linha 45) e depois redeclarado localmente (linhas 47-51). Redundância.

**Correção proposta:**
- Manter apenas o `export type` da linha 45
- Remover a redeclaração local

**Critérios de aceite:**
- `tsc --noEmit` continua passando
- Tipo continua exportado para outros módulos (preload)

---

## W5 — Handler `close` async não espera

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:215-222`

**Problema:** O handler `window.on('close', async () => {...})` é declarado como `async`, mas o Electron não espera promises em event listeners. O `await this.reportEvent(...)` pode não completar antes do processo principal continuar. A função retorna imediatamente após o primeiro `await`.

**Impacto:** Reports podem ser cortados se o Electron destruir o renderer antes do fetch completar.

**Correção proposta:**
- Remover o `async` e usar `.catch(() => undefined)` para fire-and-forget
- Garantir que o `recordDiagnosticEvent` (também async) tenha o mesmo tratamento
- Idealmente adicionar um pequeno delay (`setTimeout` 100ms) para garantir que o fetch saiu antes do CS prosseguir

**Critérios de aceite:**
- Tipo de retorno do handler é `void`, não `Promise<void>`
- Todos os awaits são seguidos de `.catch()`
- Cenário manual: usuário fecha a janela, `cancelled` chega no Web em < 3s

---

## W6 — `closeWindow` pode ser chamado de dentro de handlers que disparam `close` de novo

**Arquivo:** `MeuJudi-CS/src/main/confirmadv.ts:209-213, 240, 254`

**Problema:** Vários handlers async chamam `closeWindow`:
- `did-fail-load` (linha 212) chama `closeWindow('failed')`
- `validationTimeout` (linha 240) chama `closeWindow('expired')`
- `inactivityTimeout` (linha 254) chama `closeWindow('expired')`
- `reportEvent` (linha 318) chama `closeWindow(...)` quando o status é terminal

`closeWindow` chama `window.close()` que dispara o evento `close` que (com C1 corrigido) pode chamar `closeWindow` de novo. Sem o flag `intentionalClose`, isso vira recursão.

**Impacto:** Possível loop infinito ou múltiplas chamadas de cleanup.

**Correção proposta:**
- Resolvido junto com C1 (flag `intentionalClose` previne recursão)
- Alternativa: usar `window.removeAllListeners('close')` antes de `window.close()` (já feito em `closeWindowSilently`)
- Padronizar todos os `closeWindow` para usar o flag

**Critérios de aceite:**
- Nenhum handler dispara `close` em loop
- Cada cleanup (clearStorageData, clearTimers) roda exatamente uma vez

---

## W7 — `terminal` em `StatusCard` não está em `useMemo`

**Arquivo:** `src/app/(platform)/(tenant)/validacao-oab/status-card.tsx:55`

**Problema:** `const terminal = ESTADOS_TERMINAIS.includes(status);` é calculado a cada render. Como o componente re-renderiza quando `status` muda (a cada 2s do polling), isso é um cálculo desnecessário.

**Impacto:** Performance negligível, mas polui o código.

**Correção proposta:**
- Envolver em `useMemo`: `const terminal = useMemo(() => ESTADOS_TERMINAIS.includes(status), [status]);`

**Critérios de aceite:**
- Mudança puramente de refatoração, sem mudança de comportamento
- `tsc --noEmit` continua passando

---

## W8 — Fallback silencioso quando `event_type` e `status` custom são inválidos

**Arquivo:** `src/app/api/cs/oab-validations/[validationId]/route.ts:81`

**Problema:**
```ts
const nextStatus = body.status && VALID_STATUSES.includes(body.status) ? body.status : EVENT_STATUS_MAP[body.event_type];
```
Se o CS envia um `event_type` que está em `ALLOWED_EVENTS` mas o `EVENT_STATUS_MAP[event_type]` é `undefined` (ex.: `captcha_completed`, `code_pending`), `nextStatus` é `undefined` e nada acontece no `update`. O report é gravado em `oab_validation_events` mas o `oab_validations.status` não avança.

**Impacto:** Dificulta debug porque não há erro explícito. Mas é o comportamento desejado para eventos intermediários que não mudam status.

**Correção proposta:**
- Documentar explicitamente no comentário do código que `captcha_completed` e `code_pending` não avançam status por design
- Adicionar log quando o evento é aceito mas não muda status:
  ```ts
  if (nextStatus === undefined) {
    logger.info(`Evento ${body.event_type} registrado sem mudança de status`);
  }
  ```

**Critérios de aceite:**
- Comportamento inalterado do ponto de vista do usuário
- Debug fica mais fácil com log explícito

---
