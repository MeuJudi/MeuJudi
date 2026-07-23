# 05 — Campos "valor" e "oab" não têm implementação de IA real

> **Severidade:** 🔴 Crítica (funcionalidade ausente, não bug de regressão)
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

O tipo `CampoExtraido` (`src/lib/ia/types.ts`) declara 4 valores possíveis:
```ts
export type CampoExtraido = "prazo" | "valor" | "audiencia" | "oab";
```
E o schema inteiro foi desenhado pra suportar os 4: `regex_metadata.campo`,
`itens_revisao.campo`, `extracoes_cache.campo`, `fila_processamento_lote.campo`
e `golden_dataset_casos.campo` todos têm o mesmo `check` com os 4 valores, e
existem até seeds de regex e casos de golden dataset pra `'valor'` desde a
migration de fundação.

Na prática, só `"prazo"` é usado:

### A Camada 4 (Generalista) é hardcoded pra prazo

`src/lib/ia/generalista.ts` sempre monta o prompt via
`PROMPTS.extrairPrazo(texto, contexto)` — **não olha o valor de `campo`
recebido**. O objeto de retorno também só tem campos de prazo/audiência:
```ts
{ prazo_dias, prazo_horas, data_audiencia, fundamento_legal, confianca, custoUsd, incerto }
```
Não existe `valor_causa` nem `numero_oab` no retorno. Ou seja, mesmo que
alguém chamasse `extrairCampo({ campo: "valor", ... })` hoje, a Camada 4
rodaria o mesmo prompt de prazo e devolveria dado de prazo de qualquer jeito
— o parâmetro `campo` é ignorado nessa camada.

### Nenhum chamador real usa os outros 3 valores

Grep por `campo:\s*["'](audiencia|valor|oab)["']` em todo `src/`: **0
ocorrências**. Os únicos lugares que chamam `extrairCampo`
(`poll-datajud/route.ts`, `processar-comunicacao.ts`,
`admin/motor-extracao/actions.ts` no reprocessamento) sempre passam
`campo: "prazo"`, literal.

Isso significa que, hoje, **valor da causa e OAB são extraídos inteiramente
fora do motor de IA/Regex oficial** — usando os regex estáticos e
não-rastreados de `patterns.ts` (`extrairValor`, `converterValorMonetario`),
que nunca passam por Camada 3/4/5/6, nunca geram item de revisão, nunca
alimentam o golden dataset automaticamente, nunca se beneficiam do sistema
de estados/aprendizado. (Ver também [`08-patterns-ts-motor-paralelo.md`](08-patterns-ts-motor-paralelo.md).)

E **OAB não tem nenhum ponto de entrada** no motor de extração hoje — nem
via `patterns.ts`, nem via `extrairCampo`. O `campo: "oab"` existe só no
tipo e no schema, sem nenhum código que o produza.

---

## Qual a solução

Duas decisões independentes, uma por campo:

### Valor da causa

Já é coberto razoavelmente bem por regex determinístico
(`REGEX_VALOR` em `patterns.ts`) — valor monetário tem um formato bem
regular (`R$ 1.234,56`), então IA generativa provavelmente não agrega tanto
quanto agrega pra prazo (que tem muito mais variação de fraseado). A
recomendação aqui não é necessariamente "dar IA pro valor", mas sim: **se
esse dado já é extraído fora do pipeline oficial, ele deveria pelo menos
alimentar `extracoes_cache`/`regex_historico_validacoes` do jeito que o
`engine.ts` já sabe fazer**, pra ganhar métricas e rastreabilidade sem
precisar de IA. Isso é resolvido no doc 08 (patterns.ts), não precisa de
mudança na Camada 4 pra valor.

### OAB

Diferente do valor, número de OAB tem mais variação de formato e contexto
(pode aparecer como "OAB/PR 12.345", "OAB nº 12345-PR", dentro de uma lista
de advogados, etc.) — aqui uma Camada 4 dedicada faz mais sentido, **se**
houver um caso de uso real que precise extrair OAB de texto livre. Vale
confirmar com você: existe alguma tela/fluxo do produto que hoje depende de
extrair OAB de dentro do *texto* de uma movimentação (não do campo
estruturado `destinatarioadvogados` que o Mural já retorna separadamente)?
Se a resposta for "não, hoje a OAB sempre vem estruturada da API", talvez o
valor `"oab"` do union devesse ser **removido** do `CampoExtraido` em vez de
implementado — é código morto representando uma funcionalidade que talvez
nunca tenha sido necessária.

**Recomendação:** antes de implementar qualquer coisa aqui, confirmar com
você se há demanda de produto real pra extração de OAB via texto livre. Se
sim, segue o plano de implementação abaixo. Se não, o fix é só remover
`"oab"` do tipo e do schema (mais simples, reduz superfície de código morto).

---

## Como implementar (se confirmado que precisa de OAB via IA)

**`src/lib/ia/prompts.ts`** — novo prompt `extrairOab(texto, contexto)`,
pedindo JSON `{ numero_oab, uf_oab, nome_advogado, confianca }`.

**`src/lib/ia/generalista.ts`** — hoje é uma função única hardcoded pra
prazo. Precisa virar dependente do `campo`:
```ts
export async function extrairComIAGeneralista(
  texto: string,
  contexto: ContextoProcesso,
  campo: CampoExtraido,
): Promise<ResultadoExtracaoCompleta> {
  if (campo === "oab") return extrairOabComIA(texto, contexto);
  return extrairPrazoComIA(texto, contexto); // comportamento atual, renomeado
}
```
(Separar em duas funções internas evita misturar os dois shapes de retorno
num objeto só.)

**`src/lib/extracao/pipeline.ts`** — passar `params.campo` pra
`extrairComIAGeneralista` (hoje só passa `texto` e `contextoProcesso`).

**Chamador real** (a definir, dependendo de onde no produto isso é
necessário) — passar `campo: "oab"` explicitamente quando fizer sentido.

**Teste de verificação:**
1. Se optar por implementar: montar um texto de exemplo com OAB mencionada
   de forma não-estruturada, confirmar que `extrairCampo({ campo: "oab", ... })`
   retorna o número/UF corretos.
2. Se optar por remover: confirmar que remover `"oab"` do union
   `CampoExtraido` não quebra nenhum `check` de migration existente sem
   ajuste (as tabelas já têm o valor no `check`, então a constraint pode
   ficar como está — só o tipo TS fica mais enxuto — ou, se quiser limpar de
   verdade, uma migration troca o `check` pra 3 valores).
