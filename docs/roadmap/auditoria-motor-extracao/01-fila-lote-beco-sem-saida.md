# 01 — Fila de lote é um beco sem saída

> **Severidade:** 🔴 Crítica
> **Achado durante:** Auditoria completa do motor de Regex + IA, 23/07/2026
> **Relacionado a:** [`02-pollers-sempre-classificam-lote.md`](02-pollers-sempre-classificam-lote.md) — são duas causas do mesmo efeito (dado processado por IA e depois perdido), mas com correções independentes.

---

## O que está acontecendo

A fila de lote (Parte 9 do motor, Batch API da Anthropic) foi desenhada pra ser
mais barata (~50% de desconto) pra casos sem urgência. O fluxo de escrita
funciona; o fluxo de **leitura de volta** nunca foi fechado.

### As duas pontas que existem

**Ponta 1 — enfileirar** (`src/lib/extracao/pipeline.ts:83-104`):
```ts
if (params.contextoUrgencia) {
  const classificacao = await classificarERegistrar(supabase, params.tenantId, params.contextoUrgencia);
  if (classificacao.classificacao === "lote") {
    await enfileirarParaLote(supabase, {
      tenantId: params.tenantId,
      processoId: params.processoId,
      campo: params.campo,
      texto: params.texto,
      contexto: params.contextoProcesso as unknown as Record<string, unknown>,
    });
    // NOTA: o resultado do lote (Parte 9, coletar-resultados-lote) ainda
    // não é aplicado de volta em processos/agenda — fica pra depois
    return {
      origem: "enfileirado_lote",
      valor: resultadoRegex.match ?? null,
      confianca: resultadoRegex.match ? "media" : null,
      precisaRevisaoHumana: false,   // <- nunca vira item de revisão
      matchResult: resultadoRegex,
    };
  }
}
```
Isso insere uma linha em `fila_processamento_lote` com `status: 'pendente'` e
**retorna imediatamente** — pulando o guard de custo, as Camadas 3/4/5, e
crucialmente `criarItemRevisao` (Camada 6). O comentário no próprio código já
avisa que isso é uma lacuna conhecida.

**Ponta 2 — enviar pro batch** (`src/app/api/cron/processar-fila-lote/route.ts`):
lê `fila_processamento_lote` com `status = 'pendente'`, monta um batch
(`anthropic.messages.batches.create`), atualiza pra `status: 'enviado_batch'`.

**Ponta 3 — coletar resultado** (`src/app/api/cron/coletar-resultados-lote/route.ts`):
```ts
await supabase
  .from("fila_processamento_lote")
  .update({
    status: resultadoParseado ? "processado" : "erro",
    resultado: resultadoParseado,
    processado_em: new Date().toISOString(),
  })
  .eq("id", resultado.custom_id);
```
E é isso. A rota termina aqui.

### A prova de que ninguém lê `resultado` depois

Grep em todo `src/` por `fila_processamento_lote` retorna exatamente 3
arquivos: as duas rotas acima, e `src/lib/extracao/fila-lote.ts` (que só
contém a função de **inserir**, `enfileirarParaLote`). Nenhum cron, nenhuma
Server Action, nenhum worker, nenhum trigger de banco lê `fila_processamento_lote`
filtrando `status = 'processado'`.

### Consequência prática

Um caso que:
1. Chega no pipeline sem prazo/audiência detectado por regex simples.
2. É classificado como `"lote"` (o que hoje é **sempre** o caso pros pollers
   automáticos — ver doc 02).
3. É processado de verdade pela IA (custa dinheiro real, Anthropic cobra).
4. O resultado é salvo em `fila_processamento_lote.resultado`.
5. **Nunca mais aparece em lugar nenhum do sistema.** Não vira prazo em
   `processos`, não vira evento em `agenda_eventos`, não vira item em
   `itens_revisao`, não entra na métrica `% revisão humana` do dashboard do
   Super Admin (que só conta `regex_historico_validacoes` + `itens_revisao`).

Ou seja: o sistema paga pela IA e o resultado evapora.

---

## Qual a solução

Fechar o loop: `coletar-resultados-lote` precisa, depois de marcar
`status: 'processado'`, decidir o que fazer com `resultadoParseado` — e a
decisão certa é a **mesma que o pipeline síncrono já toma** hoje pra Camada 4
(`generalista.ts`): se a confiança for alta, aplica direto; se for baixa ou
incerta, vira item de revisão.

### Passo a passo recomendado

1. **Padronizar o formato do resultado do lote** pra bater com o que
   `extrairComIAGeneralista` já retorna (`{ prazo_dias, prazo_horas,
   data_audiencia, fundamento_legal, confianca, incerto }`) — hoje
   `processar-fila-lote/route.ts` monta o prompt via `PROMPTS.extrairPrazo`
   diretamente (não usa `generalista.ts`), então o shape já deveria bater,
   mas vale um teste de integração confirmando isso.

2. **Estender `coletar-resultados-lote/route.ts`**: depois do `update` que já
   existe, para cada item com `status: 'processado'`:
   - Se `resultado.confianca === 'alta'` e não `incerto`: aplica direto —
     mesma lógica que `poll-datajud`/`processar-comunicacao.ts` já fazem
     quando acham prazo por regex simples (`calcularPrazoFatal` +
     `update processos set prazo_proxima_resposta` + `insert agenda_eventos`).
     Vale extrair essa lógica de "aplicar prazo encontrado" pra uma função
     compartilhada (`src/lib/prazo/aplicar-prazo.ts`) já que hoje ela está
     duplicada dentro de `poll-datajud/route.ts` e `processar-comunicacao.ts`.
   - Senão: chama `criarItemRevisao` (`src/lib/extracao/central-revisao.ts`),
     com `origem: 'lote'` (hoje o parâmetro existe mas sempre vem de dentro
     do pipeline síncrono — confirmar que aceita ser chamado de fora assim,
     ou expor um wrapper).

3. **Registrar em `motor_extracao_log`** um evento tipo `lote_aplicado` /
   `lote_virou_revisao` por item, pro feed do Super Admin refletir isso.

4. **Atualizar `calcularPercentualRevisaoHumana`** (`src/lib/extracao/metrica-saude.ts`)
   pra também contar os itens de revisão originados do lote — hoje ela conta
   `regex_historico_validacoes` + `itens_revisao`, o que já cobre isso
   automaticamente **assim que** o passo 2 passar a criar itens de revisão
   pro lote também (não precisa mudar a função, só confirmar que o volume
   aparece depois do fix).

### Alternativa mais simples (se quiser um fix rápido primeiro)

Se não quiser implementar a lógica de "aplicar direto quando confiança alta"
agora, o mínimo viável é: todo item que sai de `coletar-resultados-lote` com
`status: 'processado'` vira item de revisão, sem exceção — mais simples de
implementar, mas gera mais volume na Central de Revisão do que o necessário
(perde o benefício de "confiança alta aplica sozinho" que o pipeline
síncrono já tem). Ainda assim já fecha o buraco de dado perdido, que é o
problema mais grave.

---

## Como implementar

**Arquivos a alterar:**
- `src/app/api/cron/coletar-resultados-lote/route.ts` — adicionar o bloco de
  decisão pós-`update`, descrito acima.
- Novo: `src/lib/prazo/aplicar-prazo.ts` (se for pelo caminho completo) —
  função `aplicarPrazoEncontrado(supabase, { tenantId, processoId, prazoDias,
  dataReferencia, origem })` que centraliza o `calcularPrazoFatal` + updates
  já duplicados em `poll-datajud/route.ts` e `processar-comunicacao.ts`.
  Depois de criada, os dois pollers também devem passar a chamá-la em vez de
  ter a lógica inline (reduz duplicação, não é obrigatório pro fix mas é o
  momento certo de fazer).
- `src/lib/extracao/central-revisao.ts` — conferir se `criarItemRevisao`
  aceita ser chamado fora do fluxo do `pipeline.ts` sem parâmetro que só
  existe lá dentro (ex: `matchResult`) — pode precisar de um parâmetro
  opcional ou uma variante simplificada.

**Teste de verificação:**
1. Forçar um caso a cair no lote (processo com movimentação sem prazo óbvio
   por regex, tenant sem sinal de urgência).
2. Rodar `processar-fila-lote` manualmente, esperar o batch da Anthropic
   completar (pode levar até 24h em produção — em teste, batches pequenos
   costumam voltar em minutos).
3. Rodar `coletar-resultados-lote` manualmente.
4. Confirmar que **ou** o processo tem `prazo_proxima_resposta` atualizado
   e evento em `agenda_eventos`, **ou** existe um item novo em
   `itens_revisao` com `status: 'pendente'` — nunca mais "nada".
