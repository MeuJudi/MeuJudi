# 07 — Custo reportado como zero quando o parsing do JSON falha

> **Severidade:** 🟡 Moderada
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

`src/lib/ia/confirmadora.ts` (Camada 3) e `src/lib/ia/generalista.ts`
(Camada 4) têm um único `try/catch` que envolve **duas coisas diferentes**:
a chamada de rede pra Anthropic (`chamarIA`) e o parsing da resposta
(`extrairJSON`).

```ts
try {
  const resposta = await chamarIA("validar_regex", prompt);       // já custou dinheiro aqui
  const parsed = extrairJSON<...>(resposta.texto);                 // pode falhar aqui
  ...
} catch (err) {
  // trata os dois casos igual — inclusive retorna custoUsd: 0
  return { resolvido: false, precisaCamada4: true, custoUsd: 0 };
}
```

Se `chamarIA` tiver sucesso (a Anthropic já cobrou os tokens, o `response.usage`
já existe) mas `extrairJSON` falhar (JSON malformado, truncado, ou com texto
extra que o reparo automático não consegue resolver), o `catch` externo
captura os dois cenários do mesmo jeito e devolve `custoUsd: 0` — **mesmo a
chamada tendo custado dinheiro de verdade**.

### Por que isso importa

`registrarConsumoIA` (`guard-custo.ts`) usa esse `custoUsd` pra acumular em
`consumo_ia_diario.custo_usd_acumulado`, que é exatamente o número que
`verificarTetoCusto` compara contra o teto do tenant/sistema. Se chamadas
com JSON malformado forem recorrentes (ex: um modelo com tendência a
devolver explicação longa que estoura `max_tokens` no meio do JSON — ver a
limitação documentada em `json-utils.ts`), o acumulado registrado fica
sistematicamente **menor** que o gasto real cobrado pela Anthropic — o guard
de custo fica impreciso bem na direção mais perigosa (deixa gastar mais do
que o teto real permite).

---

## Qual a solução

Separar a captura do custo da captura do erro de parsing — o custo deve ser
extraído de `resposta.custoUsd` **assim que a chamada de rede retornar com
sucesso**, independente do que aconteça depois com o parsing.

```ts
export async function executarCamada3(...): Promise<ResultadoCamada3> {
  let custoUsd = 0;
  try {
    const resposta = await chamarIA("validar_regex", prompt);
    custoUsd = resposta.custoUsd; // captura aqui, antes de qualquer risco de exceção de parsing

    const parsed = extrairJSON<{ correto: boolean; valor_correto: string | null; explicacao: string }>(resposta.texto);
    // ... resto da lógica de validação
    return { resolvido, valor, custoUsd, ... };
  } catch (err) {
    // agora custoUsd reflete a chamada de rede, mesmo se o erro foi no parsing
    return { resolvido: false, precisaCamada4: true, custoUsd };
  }
}
```

O mesmo padrão se aplica em `generalista.ts`.

---

## Como implementar

**Arquivos a alterar:**
- `src/lib/ia/confirmadora.ts` — mover a variável `custoUsd` pra fora do
  `try`, atribuir logo após `chamarIA` retornar, usar essa variável (não um
  literal `0`) no `catch`.
- `src/lib/ia/generalista.ts` — mesmo ajuste.

**Teste de verificação:**
1. Simular (ou aguardar ocorrência natural) uma resposta da IA que quebra o
   parsing (ex: mockar `extrairJSON` pra lançar exceção numa resposta que
   sabidamente tem `usage` preenchido).
2. Confirmar que o `custoUsd` retornado no objeto de erro **não** é mais
   `0`, e sim o valor calculado a partir de `response.usage` daquela
   chamada.
3. Confirmar que `consumo_ia_diario.custo_usd_acumulado` reflete esse valor
   depois de `registrarConsumoIA` rodar.
