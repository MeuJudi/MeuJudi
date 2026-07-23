# 08 — `patterns.ts` é um segundo motor de regex, paralelo e não rastreado

> **Severidade:** 🟡 Moderada
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

---

## O que está acontecendo

Existem hoje **dois motores de regex independentes** no projeto, fazendo
trabalho parecido, sem se comunicar:

### Motor 1 — `src/lib/regex/engine.ts` (o "oficial")

Orientado a banco: lê padrões de `regex_metadata`, valida segurança
(`validarSegurancaRegex`, proteção real contra ReDoS via worker thread), tem
cache (`extracoes_cache`), tem sistema de 3 estados (novo/quente/confiável)
com amostragem por IA, registra métricas (`regex_historico_validacoes`),
alimenta o dashboard do Super Admin. É chamado de dentro do `pipeline.ts`
(`extrairCampo`), que é o caminho "oficial" do motor de extração.

### Motor 2 — `src/lib/regex/patterns.ts` (paralelo)

Arrays de regex **hardcoded no código-fonte** (`REGEX_PRAZO_DIAS`,
`REGEX_PRAZO_HORAS`, `REGEX_AUDIENCIA_V2`, `REGEX_VALOR`), com funções
(`extrairPrazoDias`, `extrairPrazoHoras`, `extrairAudienciaV2`, `extrairValor`,
`converterValorMonetario`) chamadas **diretamente**, sem passar por
`engine.ts`, em:
- `src/lib/mural/processar-comunicacao.ts`
- `src/lib/datajud/sincronizar-processo.ts`
- `src/app/api/cron/poll-datajud/route.ts`

Esse motor não tem cache, não tem métricas de uso/acerto, não tem estado,
não passa pelo guard anti-ReDoS (`validarSegurancaRegex`), e não alimenta o
golden dataset nem a Central de Revisão.

### O motor 2 processa os mesmos campos que o motor 1 já cobre

`regex_metadata.campo` já suporta `'prazo'`, `'valor'`, `'audiencia'` — os
mesmos 3 campos que `patterns.ts` extrai por fora. Ou seja, há literalmente
duplicação de propósito, sem que um saiba da existência do outro.

### Não é necessariamente um erro — mas não está documentado como decisão

É plausível que isso seja intencional: `patterns.ts` funciona como uma
"pré-checagem barata e síncrona" antes de decidir se vale a pena entrar no
pipeline completo (que pode envolver IA, tem mais latência). Os 3 chamadores
de `patterns.ts` de fato usam esse padrão — só caem no `extrairCampo`
"oficial" **quando** `patterns.ts` já falhou. Se essa for a intenção, ela
nunca foi escrita em lugar nenhum — nenhum comentário em `patterns.ts` ou nos
chamadores explica por que essa duplicação existe, o que deixa a leitura do
código ambígua sobre se é design ou débito técnico acumulado.

---

## Qual a solução

Duas opções, dependendo da intenção real:

### Opção A — Documentar como Camada 0.5 legítima (menor esforço)

Se a duplicação for mesmo intencional (pré-filtro síncrono barato antes do
pipeline completo), a solução é só **documentar isso explicitamente**:
- Adicionar um comentário no topo de `patterns.ts` explicando o papel dele
  (ex: "Camada 0.5 — regex estático e barato, roda ANTES do pipeline
  oficial. Serve pra evitar gastar Camada 3/4 em casos óbvios. Não tem
  cache/métricas de propósito — é regex fixo e revisado manualmente, não
  aprendido.").
- Considerar registrar, mesmo que de forma simplificada, um evento em
  `motor_extracao_log` quando `patterns.ts` resolve um caso sozinho — hoje
  isso é 100% invisível pro dashboard do Super Admin, então não dá pra medir
  quanto do volume total de extração está passando por aqui vs. pelo motor
  oficial.

### Opção B — Migrar os padrões de `patterns.ts` pra dentro de `regex_metadata` (maior esforço, mais consistente)

Se o objetivo de longo prazo é ter **um único motor de verdade**, os padrões
de `patterns.ts` poderiam virar seeds de `regex_metadata` com `state:
'confiavel'` (já que são padrões testados manualmente, não teoricamente
"novos") e `created_by: 'seed_manual'`. Os chamadores passariam a usar
`executarRegex` direto, ganhando cache/métricas/ReDoS-guard de graça. O
trade-off é que isso adiciona uma consulta ao banco (via `engine.ts`) no
lugar de um regex síncrono em memória — troca velocidade bruta por
rastreabilidade. Como os chamadores hoje usam isso justamente pra decisão
rápida antes de entrar no pipeline pesado, essa troca pode não valer a pena
— **recomendo a Opção A** como primeiro passo, e considerar a B só se a
necessidade de métricas sobre esse volume se tornar concreta.

---

## Como implementar (Opção A, recomendada)

**Arquivo a alterar:** `src/lib/regex/patterns.ts` — comentário de cabeçalho
explicando o papel, referenciando este documento.

**Arquivos a considerar (opcional, telemetria):**
`src/lib/mural/processar-comunicacao.ts`, `src/lib/datajud/sincronizar-processo.ts`,
`src/app/api/cron/poll-datajud/route.ts` — quando `patterns.ts` resolve o
campo sozinho (sem cair no `extrairCampo`), inserir um log leve em
`motor_extracao_log` (`tipo: 'patterns_estatico_resolveu'`, `detalhes: { campo }`)
pra dar visibilidade de volume no dashboard do Super Admin, sem precisar
migrar toda a lógica pra dentro do `engine.ts`.

**Não requer migration de banco** — é uma mudança de documentação +
telemetria opcional, não de schema.
