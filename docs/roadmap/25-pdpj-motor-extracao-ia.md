# 25 — Conectar o PDPJ ao motor de extração (IA + aprendizado de regex)

Achado 04/08/2026, numa auditoria dos dados reais de extração: o PDPJ não usa o motor completo (`extrairCampo`, `src/lib/extracao/pipeline.ts`) que Mural e DataJud já usam — só chama `extrairDocumentoPdpj()` (regex pura, `src/lib/regex/pdpj-documentos.ts`), sem fallback de IA, sem fila de revisão humana, sem aprendizado automático de regex novo. Quando o regex não bate, o dado se perde em silêncio.

Este documento planeja ligar o PDPJ ao mesmo pipeline, mantendo a extração por regex que já existe (ela continua sendo a primeira tentativa, sem custo), e adiciona 3 campos novos de extração.

## 1. Estado atual (referência rápida)

```
Mural / DataJud:
  texto → extrairCampo() → Camada 0 (dado já estruturado)
                          → Camada -1/1/2 (regex + cache)
                          → Camada 3 (IA confirmadora, Haiku) — só se regex bateu com confiança média
                          → Camada 4 (IA generalista, Sonnet) — se nada bateu, ou Camada 3 discordou
                          → Camada 5 (Opus sugere regex nova) — só quando o mesmo campo repete sem regex 3x+ na semana
                          → Camada 6 (fila de revisão humana, itens_revisao) — quando a confiança final não é alta

PDPJ:
  texto → extrairDocumentoPdpj() → regex pura → aplicarPrazoEncontrado/aplicarAudienciaEncontrada
                                  → se não bateu: nada. Fim.
```

**Importante pra não confundir na implementação**: existem DOIS sistemas de regex diferentes, não um só.

1. **Regex escritas à mão no código** (`src/lib/regex/patterns.ts`, `src/lib/regex/pdpj-documentos.ts`) — compiladas no bundle, só mudam com deploy. É o que `extrairAudienciaV2`/`extrairPrazoDias` (Mural) e `extrairDocumentoPdpj` (PDPJ) usam. Continua sendo a primeira tentativa nos dois casos — este plano NÃO troca isso.
2. **Regex guardadas no banco** (`regex_metadata`) — é o que a Camada -1/1/2 (`executarRegex`, dentro de `extrairCampo`) consulta, e é o que a Camada 5 (seção 4) cria sozinha em tempo real, sem deploy. Hoje o PDPJ nunca chega nem perto dessa camada — é essa a parte que este plano liga.

Ou seja: o PDPJ mantém as regex atuais como estão (grátis, primeira tentativa) — o que muda é que, quando ELAS não baterem, em vez de desistir, passa a cair no sistema de regex-do-banco + IA que o Mural já tem.

Números reais (03/08/2026, 3272 documentos PDPJ processados) — ver conversa de origem para a tabela completa por tipo de documento. Resumo: `Sentença`/`Decisão`/`Despacho` têm 40-60% dos documentos sem NENHUM campo extraído. Auditoria cruzada no Mural (onde ainda dá pra conferir o texto original) mostra que boa parte disso é o regex sendo corretamente conservador (não inventa prazo a partir de menção genérica ou já vencida) — mas não temos como confirmar o mesmo pro PDPJ hoje, porque o texto é apagado por design de privacidade depois de processar.

## 2. Objetivo

1. Todo documento PDPJ onde o regex local não encontrar nada relevante passa pela IA (Camada 3/4) antes de desistir.
2. Quando a IA confirma um padrão repetido sem regex, o sistema aprende uma regex nova pro PDPJ do mesmo jeito que já aprende pro Mural (Camada 5).
3. Casos de baixa confiança entram na Central de Revisão (`itens_revisao`) em vez de se perderem.
4. 3 novos campos de extração: **resultado do julgamento**, **valor de condenação**, **honorários advocatícios fixados** — hoje 0% capturados em qualquer fonte.
5. Confirmar (ligando o modo debug de texto temporariamente) se os "Despacho" 100% vazios são miss real ou documento genuinamente sem conteúdo extraível.

## 3. Plano de implementação

### 3.1 Estender `CampoExtraido`

Hoje (`src/lib/ia/types.ts`): `"prazo" | "valor" | "audiencia" | "oab"`.

Adicionar: `"resultado_julgamento" | "valor_condenacao" | "honorarios"`.

Precisa propagar em:
- `regex_metadata.campo` (constraint no banco, se houver — conferir migration de criação da tabela).
- `src/lib/ia/prompts.ts` — os prompts de Camada 3/4 (`confirmarRegex`, `extrairGeneralista` ou nomes equivalentes) precisam saber descrever esses campos novos pra IA (o que é "resultado do julgamento", os valores possíveis: procedente/improcedente/parcialmente procedente/extinto sem resolução de mérito/etc — dar a lista fechada de opções na prompt reduz variação da resposta da IA).
- `src/lib/extracao/camada0.ts` (`resolverViaDadosEstruturados`) — provavelmente não tem dado estruturado prévio pra esses 3 campos (não vêm de nenhuma API estruturada), então Camada 0 sempre devolve `resolvido: false` pra eles — ok, é o esperado.

### 3.2 Regex novos (primeira tentativa, sem custo de IA)

Adicionar em `src/lib/regex/patterns.ts` (ou um arquivo novo `src/lib/regex/resultado-julgamento.ts`, seguindo o padrão de `pdpj-documentos.ts` ser separado):

- **Resultado do julgamento**: padrões tipo `julgo (totalmente )?procedente`, `julgo improcedente`, `julgo parcialmente procedente`, `JULGO EXTINTO`, `homologo o acordo`. Cuidado: são frases que aparecem em Sentença/Acórdão, geralmente na parte dispositiva (fim do texto) — vale restringir a busca à última parte do documento pra evitar pegar uma citação de jurisprudência que menciona "julgou procedente" sobre OUTRO caso.
- **Valor de condenação**: distinto de "valor da causa" (já existe). Frases tipo `condeno a parte re a pagar`, `condeno o reu ao pagamento de`, seguido de `R$ [\d.,]+`. Mesmo cuidado de posição no texto (parte dispositiva).
- **Honorários advocatícios**: `honorarios advocaticios (?:em|de|no percentual de) ([\d,]+%|R\$ [\d.,]+)`.

Todos esses 3 têm o mesmo risco: aparecem em contexto histórico/citação, não só no dispositivo atual. Vale usar a mesma técnica de `extrairDocumentoPdpj` — devolver **evidência com contexto** (trecho ao redor do match), não só o valor cru, pra quem revisar depois conseguir confirmar rápido.

### 3.3 Conectar o PDPJ ao `extrairCampo`

Em `src/app/api/cs/sync/pdpj/route.ts`, dentro de `processarTextoDocumento` — hoje só chama `extrairDocumentoPdpj(texto, doc.tipo)` e aplica prazo/audiência direto. Adicionar, pro que o regex local NÃO encontrou:

```ts
// depois do extrairDocumentoPdpj local:
if (extraido.prazos.length === 0) {
  await extrairCampo(supabase, {
    tenantId, processoId, texto,
    campo: "prazo",
    tribunal: /* sigla do tribunal do processo */,
    contextoProcesso: { classe: ..., tribunal: ..., tipo: doc.tipo ?? "" },
  });
}
// mesma ideia pra audiencia, resultado_julgamento, valor_condenacao, honorarios
```

Pontos de atenção:
- **Não chamar pra TODO campo em TODO documento** — só quando o regex local não achou nada pro campo específico (mesma lógica que o Mural já usa: só escala quando vale a pena). Um "Despacho" de 3 linhas sem nada de prazo/valor não deveria gastar 5 chamadas de IA (uma por campo) só pra confirmar que realmente não tem nada.
- **`resultado_julgamento`/`valor_condenacao`/`honorarios` só fazem sentido pra tipo Sentença/Acórdão/Decisão** — usar o `doc.tipo` (já vem oficial do PDPJ) pra filtrar antes de sequer tentar, evitando gastar IA em Despacho/Petição/Ato Ordinatório que nunca teriam isso.
- **Custo**: o guard de custo (`verificarTetoCusto`, teto diário por tenant + sistema) já existe e protege contra estouro — mas o VOLUME de documentos PDPJ (3272 só até agora, crescendo rápido com a fila normalizada) é bem maior que o volume histórico do Mural que gerou os números de custo atuais. Vale simular/estimar o custo esperado antes de ligar em produção pra todo mundo — ver seção 4.
- **`contextoUrgencia`**: o Mural passa isso pros pollers automáticos decidirem tempo real vs fila de lote (mais barato, Batch API). Documento PDPJ processado via fila do CS não tem exatamente esse conceito de "urgência" hoje — decidir se cabe aqui ou se todo PDPJ entra sempre em "tempo real" (mais caro, mas simples) numa primeira versão.

### 3.4 Verificação dos "Despacho" 100% vazios

Antes de mexer em regex, vale confirmar a causa. Plano:
1. Setar `PDPJ_TEXTO_DEBUG_TENANT_ID` (env var, já existe — ver comentário em `src/app/api/cs/sync/pdpj/route.ts`) pro tenant do Caio, temporariamente.
2. Deixar processar um lote novo de "Despacho" (ou forçar reprocessamento de alguns já existentes, se der pra re-buscar o texto no PDPJ de novo).
3. Puxar uma amostra de `processo_documentos.texto` (fica salvo enquanto a flag estiver ligada) onde `tipo = 'Despacho'` e `extracao` veio vazio, e ler os textos de verdade — mesmo processo que já foi feito pro Mural nesta investigação.
4. **Desligar a flag depois** — não é comportamento de produção, só uma janela de calibração.

## 4. Como a IA aprende um regex novo (processo técnico, referência)

Fica registrado aqui pra consulta — ver `src/lib/ia/aprender-regex.ts` e `src/lib/ia/detector-padroes-repetidos.ts`.

1. **Gatilho**: só dispara quando o mesmo campo, no mesmo tenant, precisou da Camada 4 (nenhum regex bateu) **3+ vezes nos últimos 7 dias**, E não houve tentativa de gerar regex nas últimas 6h (cooldown — evita rajada cara de Opus repetindo a mesma falha).
2. **Geração**: manda o texto + os campos que a IA (Camada 4) já extraiu daquele texto pro Opus, pedindo uma regex JavaScript que capturaria o mesmo padrão em textos futuros parecidos. Resposta é só a regex crua, sem explicação.
3. **3 travas antes de aceitar** (auto-aprovação só passa se as 3 passarem):
   - Segurança contra ReDoS (regex maliciosa/travada, `validarSegurancaRegex`).
   - A regex precisa pelo menos casar com o texto que a originou (senão é obviamente inválida).
   - Passa no "golden dataset" — um conjunto de casos-armadilha conhecidos pro campo (`rodarGoldenDataset`), garantindo que a regex nova não quebra em casos já mapeados como difíceis.
4. **Entra ativa direto**, em estado `novo` — mas com monitoramento automático depois:
   - `novo` → `quente`: precisa de 50+ usos com 90%+ de acerto.
   - `quente` → `confiavel`: precisa de 200+ usos com 98%+ de acerto (ou volta pra `novo` se cair abaixo de 85%).
   - `confiavel` → `quente`: rollback automático se, depois de virar confiável, a taxa de acerto cair abaixo de 97% (100+ usos).
   - Quando vira `confiavel` E era uma regex específica de um tenant, é promovida automaticamente pra **regex global** (vale pra todos os tenants).
5. Tudo fica registrado em `motor_extracao_log` (mudança de estado, promoção, erro) — dá pra acompanhar pelo painel do Super Admin.

Ou seja: a IA não "decide sozinha e pronto" — ela só *sugere*, passa por travas de segurança automáticas, e só ganha confiança de verdade com uso real medido ao longo do tempo, com rollback automático se piorar.

## 5. Sequência sugerida de trabalho

1. Rodar a verificação dos "Despacho" vazios (seção 3.4) — informa se vale a pena escrever regex novo pra eles especificamente, ou se são genuinamente sem conteúdo.
2. Escrever e testar os 3 regex novos (seção 3.2) isoladamente, contra uma amostra de texto real (Mural, onde ainda dá pra ver o texto — os padrões de linguagem jurídica devem ser parecidos o suficiente pro PDPJ).
3. Estender `CampoExtraido` + prompts (seção 3.1).
4. Conectar `processarTextoDocumento` ao `extrairCampo` (seção 3.3), com o filtro por `doc.tipo` pra não gastar IA à toa.
5. Rodar num período de teste curto observando `motor_extracao_log` e o custo diário acumulado antes de considerar "pronto".

## 6. Perguntas em aberto (decidir antes de implementar)

- `resultado_julgamento`/`valor_condenacao`/`honorarios` entram na Agenda como algum tipo de evento, ou só ficam guardados em `processo_documentos.extracao` pra consulta? (Prazo e audiência viram evento; esses 3 são mais "informativo" que "acionável com data".)
- Todo documento PDPJ entra em tempo real na IA, ou cabe um conceito de fila de lote (mais barato) pra quando não é urgente? Volume atual (3272 documentos, crescendo) pode justificar.
- Teto de custo diário atual (`TETO_CUSTO_IA_SISTEMA_USD`, hoje ~$10) precisa subir com o volume de PDPJ somado ao que já existe?

## 7. Log completo do motor de extração (regex + IA) — desenho travado, não implementado ainda

Pedido do Caio (04/08/2026): quer algo parecido com os logs do CS (`meujudi-cs/.../logs/`) — um registro que ele possa abrir e analisar depois pra entender o que o motor de regex/IA está fazendo. Não é só alerta de erro: quer ver o que deu certo, o que deu errado, e o que "parece normal mas pode estar errado" (ex.: um regex batendo no texto errado, sem gerar erro nenhum) — pra revisar com calma e corrigir (trocar um regex ruim, por exemplo).

### O que já existe (achado revisando o código, 04/08/2026)

- `motor_extracao_log` — tabela que já registra evento (mudança de estado de regex, erro, regex criada, promoção global, teto de custo atingido).
- Painel Super Admin, **"Feed de atividade"** (`/admin/motor-extracao`) — tabela com quando/evento/tenant/tribunal/detalhes, já filtrável por tenant/tribunal/tipo via query string. Estruturalmente já é bem parecido com uma tela de log.
- Central de Revisão (`itens_revisao`, hoje só na área do tenant, `monitoramento/revisao`) — fila de casos de baixa confiança já pensada pra correção manual.

### O gap real

O Feed de atividade só registra os eventos **excepcionais** (erro, regex criada, mudança de estado). Ele **não registra uma extração que deu certo no dia a dia** — regex bateu com confiança alta, IA confirmou, IA resolveu do zero. Sem isso, não dá pra revisar "deu certo, mas será que devia?" — só dá pra ver o que já virou problema visível.

### Desenho combinado

**Toda decisão de extração vira uma linha no log** — sucesso, dúvida e erro — do mesmo jeito que o log do CS registra toda requisição, não só as que falham.

1. Em `src/lib/extracao/pipeline.ts` (`extrairCampo`), registrar em `motor_extracao_log` (tipo novo, ex. `extracao_resolvida`) em **todo retorno**, não só nos casos que já viram evento hoje:
   - `origem` (estruturado / regex_direto / ia_confirmadora / ia_generalista / bloqueado_por_custo / sem_informacao_no_texto).
   - `campo`, `confianca`, `regex_id` (se houve), `tenant_id`, `tribunal_origem`.
   - Um trecho curto do texto ao redor do match (contexto pra julgar rápido, sem precisar abrir o documento inteiro) — mesmo padrão de "evidência com contexto" que `pdpj-documentos.ts` já usa.
2. Estender o Feed de atividade (`/admin/motor-extracao`) pra mostrar esse tipo de evento junto dos demais — mesma tabela, um filtro a mais por `origem`/confiança, pra conseguir isolar "só o que teve confiança baixa/média" quando quiser revisar em lote.
3. Linkar a Central de Revisão (`itens_revisao`) direto da linha do Feed quando aplicável — hoje ela só existe na área do tenant, sem ponte visual com o Feed do Super Admin.
4. **Sem alerta ativo/canal externo por enquanto** — decisão do Caio (04/08/2026): só painel, é suficiente por ora. Fica de fora do escopo desta parte; se precisar de aviso em tempo real (e-mail/outro canal) no futuro, é uma extensão de cima disso, não um redesenho.
5. **Resumo diário**: pedido também confirmado — um cálculo agregado (por dia: total de extrações por origem, taxa de acerto, custo, quantos foram pra revisão) exibido dentro do próprio painel (não meta implementar entrega por canal externo agora). Dá pra computar sob demanda na própria página (agregando `motor_extracao_log` do dia) sem precisar de cron/snapshot guardado — revisar se isso fica rápido o suficiente quando o volume crescer; se não, aí sim vale um snapshot diário calculado uma vez.

### Ainda em aberto pra quando for implementar

- Volume: com PDPJ conectado (milhares de documentos), logar toda extração pode gerar bastante linha — vale pensar em retenção/paginação desde o início (o Feed hoje só traz as 100 mais recentes).
- O trecho de contexto salvo no log pode conter texto de processo (potencialmente sigiloso) — confirmar se isso é aceitável guardar em `motor_extracao_log` (visível só pro Super Admin) ou se precisa de outro tratamento.
