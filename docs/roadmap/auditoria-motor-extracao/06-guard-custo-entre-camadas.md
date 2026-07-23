# 06 — Guard de custo não é reavaliado entre camadas

> **Severidade:** 🟡 Moderada
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

`src/lib/extracao/pipeline.ts` verifica o teto de custo **uma vez só**, antes
da Camada 3:
```ts
// linha ~108: única checagem de teto no pipeline inteiro
const guardCusto = await verificarTetoCusto(supabase, params.tenantId);
if (!guardCusto.podeChamarIA) { /* bloqueia tudo */ }

// Camada 3 roda, gasta dinheiro, só REGISTRA depois — não verifica de novo
const resultadoCamada3 = await executarCamada3(...);
await registrarConsumoIA(supabase, params.tenantId, resultadoCamada3.custoUsd);
if (resultadoCamada3.resolvido) { return ...; }

// Camada 4 roda incondicionalmente aqui, SEM checar teto de novo
const resultadoCamada4 = await extrairComIAGeneralista(...);
await registrarConsumoIA(supabase, params.tenantId, resultadoCamada4.custoUsd);

// Camada 5 (se acionada) também roda sem checar teto de novo
const resultadoAprendizado = await aprenderRegex(supabase, {...});
```

O comentário no código diz: *"verifica os 2 tetos ANTES de qualquer chamada
de IA (Camadas 3, 4 e 5)"* — isso é impreciso. É verdade só pro **primeiro**
gasto da invocação. Se a Camada 3 (Haiku, mais barata) fizer o acumulado
ultrapassar o teto, a Camada 4 (Sonnet, 4-10× mais cara por token) ainda
roda sem nova checagem.

### Por que o impacto é limitado, mas real

Pela auditoria da camada de IA (doc separado), o máximo de chamadas de IA
numa única invocação de `extrairCampo` é 2 (Camada 3+4, ou Camada 4+5 —
nunca as três, porque Camada 3 exige regex ter batido e Camada 5 exige regex
não ter batido, são mutuamente exclusivas). Então o "estouro" dentro de uma
única chamada é limitado a "1 chamada a mais que o ideal", não um loop
descontrolado.

O problema real é em **volume**: os pollers automáticos chamam `extrairCampo`
uma vez por movimentação/comunicação, em loop, muitas vezes por execução do
cron. Cada uma dessas chamadas só olha o teto no início *daquela* chamada —
entre uma chamada e a próxima do mesmo loop, o teto é reavaliado (correto),
mas dentro de cada chamada individual, o "1 a mais" se repete a cada
iteração do loop até o teto realmente barrar a *próxima* invocação. Em um
cron que processa centenas de movimentações, isso pode significar dezenas de
chamadas "a mais" de Sonnet/Opus antes do guard pegar de vez.

---

## Qual a solução

Adicionar uma segunda checagem de teto **entre** a Camada 3 e a Camada 4 (e,
por construção, isso também cobre antes da Camada 5, já que ela só roda
depois da 4).

```ts
if (resultadoCamada3.resolvido) { return ...; }

// NOVO: reavalia o teto antes de escalar pra Camada 4 (mais cara)
const guardAposCamada3 = await verificarTetoCusto(supabase, params.tenantId);
if (!guardAposCamada3.podeChamarIA) {
  const resultadoBloqueado: ResultadoExtracao = {
    origem: "bloqueado_por_custo",
    valor: resultadoRegex.match ?? null,
    confianca: resultadoRegex.match ? "media" : null,
    precisaRevisaoHumana: true,
    matchResult: resultadoRegex,
  };
  await criarItemRevisao(supabase, { ...mesmo padrão já usado na checagem inicial... });
  return resultadoBloqueado;
}

const resultadoCamada4 = await extrairComIAGeneralista(...);
```

Isso reusa exatamente o mesmo padrão que já existe pra checagem inicial (não
é lógica nova, é repetir o bloco que já existe num segundo ponto).

---

## Como implementar

**Arquivo a alterar:** `src/lib/extracao/pipeline.ts` — extrair o bloco de
"bloquear por custo + criar item de revisão" (que hoje só existe uma vez,
antes da Camada 3) pra uma função interna reutilizável, e chamá-la duas
vezes: antes da Camada 3 (como já é hoje) e entre a Camada 3 e a Camada 4.

```ts
async function bloquearPorCusto(
  supabase: SupabaseClient,
  params: { tenantId: string; processoId: string; campo: CampoExtraido; tribunal: string; texto: string },
  resultadoRegex: MatchResult,
): Promise<ResultadoExtracao> {
  const resultadoBloqueado: ResultadoExtracao = {
    origem: "bloqueado_por_custo",
    valor: resultadoRegex.match ?? null,
    confianca: resultadoRegex.match ? "media" : null,
    precisaRevisaoHumana: true,
    matchResult: resultadoRegex,
  };
  await criarItemRevisao(supabase, { tenantId: params.tenantId, processoId: params.processoId, campo: params.campo, tribunalOrigem: params.tribunal, textoOriginal: params.texto, resultado: resultadoBloqueado });
  return resultadoBloqueado;
}
```

E também corrigir o comentário em `pipeline.ts` que hoje afirma algo que só
é parcialmente verdade, pra refletir o comportamento real (checa antes da
Camada 3 e de novo antes da Camada 4).

**Teste de verificação:**
1. Configurar um `teto_custo_ia_diario_usd` bem baixo pra um tenant de teste
   (ex: `0.001`, menor que o custo de uma chamada de Haiku).
2. Forçar um caso que bate um regex de confiança média (vai pra Camada 3).
3. Confirmar que a Camada 3 roda (consome o pouco de teto que havia) e, ao
   tentar escalar pra Camada 4, o novo guard bloqueia — o resultado final
   deve ser `origem: "bloqueado_por_custo"`, não uma chamada de Sonnet
   acontecendo mesmo assim.
4. Conferir em `consumo_ia_diario` que o custo registrado é só o da Camada 3
   (Haiku), não inclui uma tentativa de Camada 4.
