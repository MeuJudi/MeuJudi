# 27 — Nomear prazo e audiência (título específico em vez de genérico)

> **Status (04/08/2026): Audiência (3.1) e Prazo (3.2) implementadas.**
> Documento completo — ver "Implementado" em cada seção pro que mudou do
> desenho original pro código real.

## 1. Objetivo

Hoje, todo evento de prazo/audiência criado automaticamente na Agenda
(`agenda_eventos.titulo`) tem um título genérico:

- Prazo: sempre `"Prazo: {N} dias"` (`aplicar-prazo.ts:39`) — nunca diz pra
  quê é o prazo (contestação? manifestação? recurso?).
- Audiência: varia por chamador, mas nunca é a natureza real da audiência —
  vem do tipo da comunicação do Mural (`"Intimação - TJPR"`), do tipo do
  documento do PDPJ (`"Audiência — Despacho"`), ou só `"Audiência"` puro.

O Caio quer que o título mostre o que aquele prazo/audiência **é de
verdade** (ex.: "Audiência de Conciliação", "Prazo para Contestação") — uma
informação que o texto de origem quase sempre menciona.

## 2. Estado atual — o que já é capturado e descartado

### Audiência: parte do trabalho já existe, só não é usada

`REGEX_AUDIENCIA_V2` (`src/lib/regex/patterns.ts:95-212`) tem 16 padrões.
Levantamento de quais já capturam a natureza da audiência num grupo `tipo`
versus quais mencionam mas descartam:

| Padrão | Captura `tipo` hoje? | Observação |
|---|---|---|
| `audiência tipo + data + horário + plataforma` (linha 98) | ✅ sim | grupo `tipo: 1`, mas exige aspas no texto (`Audiência "de Conciliação"...`) — raro |
| `sessão de julgamento` (linha 113) | ✅ sim (fixo) | sempre grava `tipo: 'sessao'` |
| `audiência designada para data` (linha 108) | ❌ não | a natureza (instrução/conciliação/una/inicial/preliminar) está no regex mas dentro de um grupo **não-capturante** `(?:...)` — descartada de propósito |
| `audiência de [tipo], ... para o dia + hora` (linha 154) | ❌ não | `[\wÀ-ÿ\s]+?` consome o texto do tipo sem capturar |
| `audiência (re)designada (data entre parênteses)` (linha 166) | ❌ não | mesma coisa: `[\wÀ-ÿ.\s]+?` engole "DE CONCILIAÇÃO"/"DE INSTRUÇÃO"/"DO ART. 334 CPC" sem guardar |
| demais 11 padrões (genéricos, "designada + data", pautas, etc.) | ❌ não | o texto ao redor da data raramente tem a natureza da audiência de forma previsível o suficiente pra valer regex específico agora |

Ou seja: **3 dos 16 padrões** já têm ou são fáceis de fazer capturar o tipo
sem reescrever a regex — só trocar `(?:...)` por `(...)` e adicionar ao
`grupo`. Isso cobre uma fração real (não todos) das audiências extraídas.

Mesmo quando capturado, o valor **nunca chega ao título**: nenhum dos 4
chamadores de `aplicarAudienciaEncontrada` (`mural/processar-comunicacao.ts:266`,
`cs/sync/pdpj/route.ts`, `cron/coletar-resultados-lote/route.ts`,
`datajud/sincronizar-processo.ts`) usa `audiencia.tipo`/`resultado.tipo` —
todos montam o `titulo` a partir de outra coisa (tipo de comunicação, tipo
de documento, ou string fixa).

### Prazo: nada capturado, é preciso construir do zero

`REGEX_PRAZO_DIAS` (`patterns.ts:42-58`) só extrai o número — nenhum padrão
tenta capturar o motivo/ato do prazo. O texto de origem geralmente menciona
("apresentar contestação no prazo de 15 dias", "manifeste-se em 5 dias"),
mas a variação de fraseado é maior que em audiência, então a taxa de acerto
de um regex aqui vai ser menor.

## 3. Desenho proposto

### 3.1 Audiência — vitória rápida

1. **Capturar o que já dá pra capturar**: trocar os 3 padrões da tabela
   acima (`designada para data`, `de [tipo], ... para o dia`, `(re)designada
   entre parênteses`) pra usar grupo capturante em vez de não-capturante.
2. **Normalizar o valor capturado** — o texto bruto varia
   (`"de Conciliação"`, `"CONCILIAÇÃO"`, `"de Instrução e Julgamento"`,
   `"DO ART. 334 CPC"`) e vai parar direto no título se não for limpo.
   Proposta: uma função pequena `normalizarTipoAudiencia(bruto: string):
   string | null` que reconhece um dicionário fechado de naturezas comuns
   (conciliação, instrução, instrução e julgamento, una, inicial,
   preliminar, sessão de julgamento, art. 334 CPC/conciliação obrigatória) e
   devolve a forma canônica capitalizada, ou `null` se não reconhecer nada
   do dicionário — nesse caso, cai no título genérico de hoje, nunca mostra
   lixo bruto do regex.
3. **Usar isso no título** — em vez de cada chamador montar seu próprio
   título com a fonte (Mural/tipo de documento), o título vira: `tipo
   normalizado, se houver` (`"Audiência de Conciliação"`) **senão** o que já
   existe hoje (fallback, não regressão).

#### Implementado (04/08/2026) — desvio do plano original, mais simples

Em vez de editar regex por regex (item 1 acima), usei uma abordagem mais
robusta descoberta ao implementar: `extrairAudienciaV2` agora guarda
`texto_completo: m[0]` (o texto inteiro casado pelo regex, não só os grupos
capturados) em todo resultado. `normalizarTipoAudiencia(...textos)`
(`src/lib/regex/patterns.ts`) recebe candidatos em ordem de prioridade
(`.tipo` primeiro, `.texto_completo` como fallback) e busca um dicionário
fechado de palavras-chave (sem acento, case-insensitive) em qualquer um
deles. Isso cobre automaticamente **todos** os 16 padrões que mencionam a
natureza da audiência no texto casado — não só os 3 identificados na
análise original — sem precisar tocar em nenhuma regex existente.

Também descobri que o PDPJ usa um motor de extração totalmente separado
(`src/lib/regex/pdpj-documentos.ts`, tipo `AudienciaPdpj` com campos
`valor`/`contexto`, não `AudienciaExtraida` de `patterns.ts`) — a nota da
seção 5 original ("todos passam pelas mesmas funções") estava errada. Como
`normalizarTipoAudiencia` só faz busca de palavra-chave, funciona igual
sobre `primeiraAudiencia.valor`/`.contexto` do PDPJ sem nenhuma mudança
adicional — só chamado com esses campos no lugar de `.tipo`/`.texto_completo`.

Dicionário implementado (`TIPOS_AUDIENCIA_CONHECIDOS`,
`patterns.ts`): instrução e julgamento, encerramento de instrução,
instrução, conciliação, mediação, custódia, admonitória, una, preliminar,
sessão de julgamento (+ fallback pra "sessão" isolada — o padrão "sessão de
julgamento" de `patterns.ts` grava `tipo: 'sessao'` fixo sem a palavra
"julgamento" no texto real, então precisava de um padrão mais solto só pra
esse caso), pauta de julgamento, art. 334 CPC, inicial. Ordem importa: mais
específico primeiro (ex. "instrução e julgamento" antes de "instrução"
isolado), "inicial" por último (palavra mais genérica, maior risco de
falso positivo se checada cedo).

Título centralizado em `aplicarAudienciaEncontrada`
(`src/lib/prazo/aplicar-prazo.ts`) via novo parâmetro opcional
`tipoAudiencia` — `titulo: params.tipoAudiencia ?? params.titulo ?? "Audiência"`.
Os 3 chamadores que tinham regex disponível (2x `mural/processar-comunicacao.ts`,
1x `cs/sync/pdpj/route.ts`) passam o valor normalizado; `cron/coletar-resultados-lote/route.ts`
(resultado vem da IA, sem regex/`tipo` disponível) não foi tocado — continua
no título genérico, sem regressão.

### 3.2 Prazo — mais trabalho, resultado parcial

1. **Dicionário de atos processuais comuns** perto da menção do prazo:
   contestação, manifestação, réplica, embargos (de declaração/execução),
   recurso (apelação/agravo/especial), impugnação, cumprimento de sentença,
   emenda à inicial, pagamento, comprovação. Regra: procurar esse
   dicionário numa janela de texto próxima (antes ou depois, ex. ±80
   caracteres) de onde o prazo foi encontrado — não em qualquer lugar do
   documento (documento pode mencionar "contestação" em um parágrafo e o
   prazo de outra coisa em outro).
2. **Confiança mais baixa que audiência**: como o "achado perto do prazo"
   é uma heurística de proximidade (não uma regex ancorada como as de
   audiência), classificar como `extracaoConfianca: "media"` mesmo quando
   reconhece algo — nunca "alta" como os casos de audiência bem ancorados.
3. Mesmo fallback: não reconheceu nada do dicionário → título genérico
   `"Prazo: N dias"` de hoje, sem regressão.

#### Implementado (04/08/2026)

Seguiu o desenho quase à risca, com uma peça a mais descoberta na hora:

- `encontrarMatchPrazoDigitos()` (novo, privado) extraído do corpo de
  `extrairPrazoDias` — mesmo loop sobre `REGEX_PRAZO_DIAS`, só que devolve o
  `RegExpMatchArray` inteiro (com `.index`) em vez de só o número.
  `extrairPrazoDias` continua com o comportamento idêntico de antes (só
  chama a função nova por dentro); zero risco de regressão nele.
- `extrairNaturezaPrazo(texto)`: acha a posição do match (via
  `encontrarMatchPrazoDigitos`, com fallback pro padrão por extenso), recorta
  ±80 caracteres ao redor e busca o dicionário de atos processuais
  (`ATOS_PROCESSUAIS_CONHECIDOS`, `patterns.ts`) — mesma técnica de
  acento-insensível usada em `normalizarTipoAudiencia`. Ordem importa: termos
  compostos antes da forma genérica (ex. "embargos de declaração" antes de
  "embargos" solto, "recurso especial/extraordinário" antes de "recurso").
- **Peça a mais**: a busca do dicionário virou uma função própria exportada,
  `normalizarAtoProcessual(textoJanela)` — porque o motor de extração do
  PDPJ (`pdpj-documentos.ts`) já entrega um `contexto` pronto (janela de
  ~100 antes + 180 depois do prazo, calculada por ele mesmo) e não faz
  sentido `extrairNaturezaPrazo` re-achar a posição do zero num texto que já
  é só a janela. O chamador do PDPJ (`cs/sync/pdpj/route.ts`) usa
  `normalizarAtoProcessual(primeiroPrazo.contexto)` direto; os outros 3
  chamadores (2x Mural, DataJud) usam `extrairNaturezaPrazo(textoCompleto)`.
- Confiança forçada pra "media" dentro de `aplicarPrazoEncontrado` sempre
  que `naturezaPrazo` está presente — mesmo que o chamador tenha passado
  "alta" (o dia continua com a confiança que o chamador decidiu; só a
  natureza do ato é que nunca é tratada como certeza alta).
- Título final: `"Prazo para {natureza}"` (ex. `"Prazo para Contestação"`)
  quando reconhece algo, senão o genérico `"Prazo: N dias"` de sempre.
- Conectado nos 4 chamadores reais com texto disponível:
  `mural/processar-comunicacao.ts` (2x), `cs/sync/pdpj/route.ts`,
  `cron/poll-datajud/route.ts`, `lib/datajud/sincronizar-processo.ts`.
  `cron/coletar-resultados-lote/route.ts` (resultado vem da IA, sem texto
  bruto disponível pra buscar o dicionário) não foi tocado — mesmo padrão
  da Audiência, sem regressão.

### 3.3 Centralizar a decisão em vez de duplicar por chamador — **[implementado]**

Feito nas duas implementações acima: `titulo` é decidido dentro de
`aplicarAudienciaEncontrada`/`aplicarPrazoEncontrado` (`aplicar-prazo.ts`),
não mais montado por cada chamador. Nenhum chamador novo precisa lembrar
dessa lógica — só passar o valor normalizado (ou nada, e cai no genérico).

Hoje cada um dos 4-5 chamadores monta seu próprio `titulo` manualmente.
Proposta: mover a lógica de "título específico se tiver, genérico se não"
pra **dentro** de `aplicarPrazoEncontrado`/`aplicarAudienciaEncontrada`
(`aplicar-prazo.ts`) — os parâmetros de entrada passam a incluir o tipo
normalizado (opcional), e a função decide o título final num único lugar.
Isso evita que um 6º chamador futuro esqueça de aplicar a mesma lógica (o
tipo de bug que já apareceu antes nesta sessão — "esqueceu de propagar em
todos os lugares").

## 4. Sequência sugerida

1. Escrever `normalizarTipoAudiencia()` + os 3 regex de audiência ajustados
   + testes com exemplos reais de texto do Mural/PDPJ já vistos nesta sessão
   e em `docs/roadmap/auditoria-motor-extracao/`.
2. Centralizar o título em `aplicar-prazo.ts` (só pra audiência primeiro,
   menor risco).
3. Medir/validar com processos reais antes de mexer em prazo (que é mais
   arriscado/impreciso) — ver se o ganho de audiência já está bom o
   suficiente ou se vale continuar.
4. Só então (se topar) atacar o dicionário de atos processuais do prazo.

## 5. Perguntas em aberto

- **Dicionário de naturezas de audiência** — a lista do item 3.1.2 acima é
  um ponto de partida baseado no que já aparece nos 16 regex existentes;
  vale revisar contra uma amostra maior de textos reais antes de fechar
  (mesmo processo usado nas auditorias anteriores de regex desta sessão).
- **Prazo: vale a pena mesmo?** — **[respondido 04/08/2026]** o Caio pediu
  pra implementar direto, sem esperar validar Audiência primeiro em produção.
  Fica valendo o mesmo cuidado do design original: confiança sempre "media"
  nessa parte, nunca "alta", e dicionário fechado (nunca escreve texto bruto
  não reconhecido no título) — a mitigação de risco já estava no plano,
  então seguiu direto pra implementação.
- **Quem herda o benefício automaticamente** — **[corrigido 04/08/2026, era
  impreciso]** vale pra **Prazo** nos 3 (Mural, PDPJ, DataJud) — confirmado,
  os 4 chamadores reais cobrem as 3 fontes. Pra **Audiência** só vale Mural e
  PDPJ: o DataJud (`poll-datajud`/`sincronizar-processo.ts`) nunca extraiu
  audiência de movimentação, só prazo — nunca chamou
  `aplicarAudienciaEncontrada`, mesmo antes desta sessão. A nota original
  ("todos passam pelas mesmas funções") misturava os dois casos.
