# 11 — Código órfão e ajustes menores

> **Severidade:** 🟢 Menor
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026

Três itens pequenos, agrupados aqui por serem baixo risco e rápidos de
resolver — não representam bug de comportamento, só limpeza/robustez.

---

## 11.1 — Tarefas e prompt órfãos em `src/lib/ia/`

### O que está acontecendo

`src/lib/ia/client.ts` declara um mapeamento `TAREFAS` com 8 entradas:
```ts
const TAREFAS: Record<string, ModeloIA> = {
  validar_regex: "haiku",
  extrair_prazo_simples: "haiku",       // órfã
  classificar_intimacao: "haiku",       // órfã
  resumir_curto: "haiku",               // órfã
  extrair_prazo_complexo: "sonnet",
  resumir_processo: "sonnet",           // órfã
  ocr_pdf: "sonnet",                    // órfã
  sugerir_regex: "opus",
};
```
Só `validar_regex`, `extrair_prazo_complexo` e `sugerir_regex` têm chamador
de verdade (`confirmadora.ts`, `generalista.ts`, `aprender-regex.ts`,
respectivamente). As outras 5 não são referenciadas em nenhum lugar de
`src/lib/ia/` nem `src/lib/extracao/`.

Da mesma forma, `src/lib/ia/prompts.ts` define `PROMPTS.classificarIntimacao`
sem nenhum chamador.

### Qual a solução

Se essas tarefas representam funcionalidade planejada pra depois (parece o
caso — `ocr_pdf` e `resumir_processo` fazem sentido no contexto do CS/PJe,
que ainda está em desenvolvimento), o ideal é só **marcar com comentário**
que são planejadas e não implementadas ainda, pra quem ler o código não
achar que é uma chamada faltando por engano:
```ts
const TAREFAS: Record<string, ModeloIA> = {
  validar_regex: "haiku",
  extrair_prazo_complexo: "sonnet",
  sugerir_regex: "opus",
  // Planejadas, sem chamador ainda (CS/PJe — ver docs/roadmap/09-cert-a1.md):
  extrair_prazo_simples: "haiku",
  classificar_intimacao: "haiku",
  resumir_curto: "haiku",
  resumir_processo: "sonnet",
  ocr_pdf: "sonnet",
};
```
Se não houver plano concreto de usá-las, o mais limpo é remover — reduz
superfície de código sem chamador, que é sempre uma fonte de confusão numa
auditoria futura.

### Como implementar

Decisão simples de manter (com comentário) ou remover — não precisa de
migration, é só `src/lib/ia/client.ts` e `src/lib/ia/prompts.ts`
(`classificarIntimacao`).

---

## 11.2 — Sem timeout customizado nas chamadas de IA

### O que está acontecendo

`chamarIA` (`src/lib/ia/client.ts`) chama `client.messages.create({...})`
sem `timeout` nem `AbortSignal` explícitos. O SDK da Anthropic tem defaults
(`max_retries: 2`, timeout padrão de ~10 minutos) — o que significa que, no
pior caso, uma chamada pode ficar pendurada por até ~30 minutos (10 min ×
3 tentativas) antes de desistir.

Num pipeline síncrono chamado de dentro de um cron job (`poll-datajud`,
`poll-mural`), isso é um risco real: se a Anthropic estiver degradada, uma
única chamada travada pode segurar o processamento de todo o lote de
movimentações daquela execução do cron, já que o `await extrairCampo(...)`
está dentro de um loop sequencial (ou paralelo limitado, dependendo do
poller).

### Qual a solução

Configurar um timeout mais agressivo e específico pro contexto de uso
(mais curto que os minutos default do SDK, já que essas chamadas são
"deve responder rápido ou desistir e deixar a Central de Revisão cuidar"):
```ts
const response = await client.messages.create(
  { model, max_tokens, messages },
  { timeout: 20_000 }, // 20s — generoso pra Haiku/Sonnet, mas não trava um cron por minutos
);
```
Quando o timeout estoura, o `catch` já existente nos chamadores
(`confirmadora.ts`, `generalista.ts`) trata isso como `incerto: true` — ou
seja, o comportamento de fallback já existe, só falta apertar o timeout pra
ele disparar mais cedo em vez de deixar o processo pendurado.

### Como implementar

**Arquivo a alterar:** `src/lib/ia/client.ts` — adicionar `{ timeout: 20_000 }`
como segundo argumento de `client.messages.create` dentro de `chamarIA`.
Considerar deixar o valor configurável via `process.env.IA_TIMEOUT_MS` com
esse default, caso precise ajustar sem redeploy.

**Teste de verificação:** difícil de testar deliberadamente sem mockar a
API. Verificação prática: monitorar `motor_extracao_log` depois do deploy
por incerto/timeout e confirmar que não aumentou a taxa de `incerto: true`
de forma anormal (um timeout muito agressivo pode cortar chamadas que
estavam prestes a responder corretamente).

---

## 11.3 — Resultado da Camada 3 (confiança "média") nunca vai pro cache

### O que está acontecendo

`src/lib/regex/engine.ts`, `salvarNoCache` só é chamado quando
`deveValidarComIA` retorna `false` (ou seja, quando o resultado **não**
precisou de confirmação por IA — confiança já nasce "alta"). Quando o
regex é amostrado pra validação (confiança "média"), o resultado **não** é
salvo em `extracoes_cache`, mesmo depois da Camada 3 confirmar que estava
correto.

### Por que isso pode ser desperdício

Se o mesmo texto (ou texto com hash idêntico após normalização) aparecer de
novo — o que é comum em textos padronizados de intimação/movimentação —, ele
vai ser reamostrado pra IA de novo (30% de chance se `quente`, 1% se
`confiavel`), gastando uma chamada de Haiku que já foi paga uma vez pro
mesmo conteúdo.

### Qual a solução

Depois que a Camada 3 confirma (`resolvido: true`), gravar o resultado no
cache também — usando o mesmo `salvarNoCache` que `engine.ts` já expõe (hoje
não-exportado; precisaria virar exportado, ou o `pipeline.ts` precisaria de
uma função equivalente).

### Como implementar

**`src/lib/regex/engine.ts`** — exportar `salvarNoCache` (hoje privada).

**`src/lib/extracao/pipeline.ts`** — depois de `resultadoCamada3.resolvido === true`,
antes do `return`, chamar `salvarNoCache(supabase, hashTexto(params.texto), params.campo, resultadoCamada3.valor, "alta", ...)`.

**Nota:** isso é uma otimização de custo, não uma correção de bug — vale
menos prioridade que os achados críticos/moderados deste documento. Incluído
aqui só porque foi observado durante a auditoria.

### Teste de verificação

1. Forçar um caso que cai em confiança "média" e é confirmado pela Camada 3.
2. Rodar o mesmo texto de novo (mesmo hash) imediatamente depois.
3. Confirmar que a segunda passada bate no cache (`origem: "regex_direto"`,
   sem nova chamada de IA), em vez de reamostrar.
