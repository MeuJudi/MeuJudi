# 28 — Robustez da autenticação/sincronização com o PDPJ

> **Status (14/08/2026): todos os itens (3.1 a 3.6) implementados.** Este
> documento nasceu de uma investigação real (mesma data) sobre o Sync
> ficando lento/travando ao validar o Bearer do PDPJ — ver achados na
> seção 2. Dois itens passaram por correção depois de revisão do Caio ou
> de inspeção do código existente antes de implementar: o item 2 (a
> primeira versão da ideia estava errada) e o item 3.6 (a métrica que o
> plano original citava, `reportPendingCount`, não media o que precisava —
> ver notas nas seções respectivas). Nenhuma versão nova do Sync foi
> publicada ainda com essas correções.

## 1. Objetivo

O fluxo de login/revalidação com o PDPJ (`meujudi-cs/src/main/pdpj-auth.ts`)
funciona, mas é frágil: numa única sessão de investigação (14/08/2026)
foram achados um loop de redirecionamento que trava o app, uma janela sem
timeout, e nenhum jeito de saber que a fila estava travada sem a sessão
estar "quebrada" de verdade. O objetivo aqui não é reescrever o fluxo do
zero — é endurecer os pontos específicos que já se mostraram frágeis na
prática, mantendo o desenho geral (BrowserWindow real, cookies + Bearer,
fila unificada) que já funciona.

**Fora de escopo, por decisão do Caio (14/08/2026):** usar Judit/Escavador
como fallback pago quando o scraping direto falha (item 7 da conversa
original) — custo não compensa agora. Pode voltar a ser avaliado no
futuro, mas não faz parte deste plano.

## 2. O que motivou este plano (achados da investigação de 14/08/2026)

- **Loop de redirecionamento**: a janela técnica reaproveitada pela
  revalidação automática (`doEnsureApiSession`) ficou presa navegando
  sozinha em `https://www.jus.br/` por 10+ minutos seguidos, rodando CPU
  cheia mesmo escondida (`backgroundThrottling: false`). Corrigido
  parcialmente na v0.3.27: a janela agora é destruída quando a validação
  falha, em vez de mantida viva pro próximo ciclo — mas a causa de ela
  entrar no loop (item 2 abaixo) continua.
- **Sessão não sobrevive à noite parada**: log mostrou `nenhuma sessao
  salva disponivel` repetido por ~11h seguidas (00:00–11:26 UTC) até um
  login novo suceder.
- **Reconexão do Realtime em loop** (`document-requests.ts`) — assunto
  relacionado mas separado, não coberto por este documento.
- **Confirmado (05-06/08/2026, e revalidado nesta conversa)**: não existe
  hoje uma API oficial da PDPJ pra "consultar processos por OAB de
  terceiro" que substitua o scraping via BrowserWindow — ver pesquisa na
  conversa. O caminho institucional (Acordo com o CNJ) é desproporcional;
  o caminho self-service (Domicílio Judicial Eletrônico) é só CNPJ e só
  cobre citações/intimações, não consulta de processo. Isso reforça que
  vale investir em robustecer o que já existe, não substituir.

## 3. Melhorias propostas

### 3.1 [implementado, 14/08/2026] Separar a janela de login manual da janela de revalidação técnica

**Problema hoje**: `showLoginWindow()` e `doEnsureApiSession()` compartilham
o mesmo campo `this.authWindow` (`pdpj-auth.ts`). Já existe um remendo pra
isso (`loginEmAndamento`, campo booleano que faz a revalidação automática
adiar se um login manual está rolando — achado 06/08/2026), mas o problema
de fundo continua: a mesma instância de `BrowserWindow`, com os mesmos
listeners de `did-navigate`/`did-navigate-in-page` (registrados uma vez na
criação, nunca removidos), fica acumulando estado entre um uso e outro.
Quando ela entra num estado ruim (cookies/localStorage inconsistentes,
como vimos no loop de redirecionamento), esse estado ruim persiste pro
próximo ciclo de revalidação, 5 minutos depois.

**Proposta**: duas janelas completamente independentes:
- Uma só para `showLoginWindow()` (login interativo, visível, com o fluxo
  de certificado/MFA) — comportamento não muda.
- Uma só para a revalidação técnica em segundo plano
  (`doEnsureApiSession`/`ensurePortalBearer`) — nunca reaproveitada entre
  ciclos. Já é destruída em caso de falha desde a v0.3.27; a mudança aqui
  é destruir e recriar **sempre**, mesmo em sucesso, ou pelo menos nunca
  compartilhar com a janela de login.

**Efeito colateral a considerar**: criar uma janela nova a cada ciclo de
5min tem um custo (tempo de carregar cookies + navegar até a área
autenticada) que hoje é evitado reaproveitando a janela "quente". Precisa
medir se isso aumenta o tempo médio de revalidação antes de considerar
pronto — não é uma troca sem custo, só sem o risco de estado acumulado.

> **Achado real, 17/08/2026 (pós-v0.3.28 em produção)**: confirmado ao
> vivo — o loop de redirecionamento em www.jus.br (mesmo problema do
> item 3.2) ainda acontece mesmo com janela sempre nova; numa tentativa
> real, 300 navegações em 157 segundos antes de desistir. O problema não
> era só a janela ficar "suja" entre ciclos — é que o timeout de 45s
> (`BEARER_CAPTURE_TIMEOUT_MS`) só cobria o loop interno de
> `ensurePortalBearer`, não a chamada inteira (o `loadURL` inicial, antes
> do loop começar a contar, podia demorar sem limite nenhum). Corrigido
> envolvendo a chamada inteira com `withHardTimeout` (o mesmo helper do
> item 3.3), teto de 70s — ver `ENSURE_PORTAL_BEARER_HARD_TIMEOUT_MS`.
> Uma segunda tentativa na mesma sessão, com janela nova, levou só 7,5s —
> o loop parece intermitente, não constante.

**Arquivos**: `meujudi-cs/src/main/pdpj-auth.ts` (`doEnsureApiSession`,
`showLoginWindow`, remove o compartilhamento de `this.authWindow`).

**Implementado como**: novo campo `revalidationWindow`, só usado por
`doEnsureApiSession`. A janela é criada do zero em toda chamada e destruída
no `finally` — em sucesso e em falha, nunca mais fica viva pro próximo
ciclo (a versão da v0.3.27 só destruía em falha). `captureSession`,
`waitForPdpjCookies`/`getPdpjCookies` e `ensurePortalBearer`/
`diagnosticarPagina` deixaram de ler `this.authWindow` implicitamente e
passaram a receber a janela como parâmetro — `showLoginWindow` continua
passando a sua (`this.authWindow`), `doEnsureApiSession` passa a
`revalidationWindow`. De quebra, `getPdpjCookies` parou de exigir uma
janela aberta pra funcionar: cookies vivem em
`electronSession.defaultSession` (nenhuma janela deste app usa
`partition` própria), não numa instância de janela específica. O efeito
colateral mencionado acima (custo de recriar a janela a cada ciclo) ainda
não foi medido em produção — vale observar no primeiro dia real.

### 3.2 [implementado, 14/08/2026] Trocar checagem única do DOM por espera com retry (não eliminar a interação)

> **Nota de correção**: a versão original desta ideia (sugerida antes deste
> documento) propunha parar de simular clique/busca e confiar só na
> captura passiva do Bearer (`onBeforeSendHeaders`). **Isso não funciona**
> — já está documentado no próprio código (comentário do
> `BEARER_PRIME_CNJ_FALLBACK`, achado real de 29/07/2026) que o Portal
> **nunca** dispara uma chamada autenticada sozinho, só depois de uma
> busca de verdade. Capturar de forma passiva sem simular a busca deixaria
> de funcionar por completo, não só "menos confiável". Corrigido aqui.

**Problema real (achado 14/08/2026, ao vivo)**: o código de
`ensurePortalBearer` (`pdpj-auth.ts`) faz a checagem de "página
autenticada" (`temLinkConsultarProcessos`, `temComboboxBusca` etc.) e a
simulação de busca (clique em campo, seleção de OAB, clique em Buscar) com
`document.querySelector` **de uma vez só**, num instante fixo após a
navegação. Se o Angular ainda não terminou de renderizar naquele
milissegundo exato — o que aconteceu ao vivo às 11:31:43 desta conversa,
293ms depois de uma navegação — o código conclui "não autenticado" ou "não
achou o campo" errado, e desiste ou recarrega sem necessidade.

**Proposta**: trocar os `document.querySelector` de tentativa única por um
loop de espera (poll a cada ~200ms, até um teto de alguns segundos) tanto
na detecção de "página autenticada" quanto na simulação de busca (achar
combobox, achar opção OAB, achar input, achar botão Buscar). Continua
sendo a mesma interação (clicar/digitar/buscar) — só para de assumir que o
elemento já está lá no primeiro instante em que olha.

**Arquivos**: `meujudi-cs/src/main/pdpj-auth.ts`
(`ensurePortalBearer`, `diagnosticarPagina`, o bloco `executeJavaScript` de
busca automática).

**Implementado como**: os três scripts injetados (achar "Consultar
processos", achar o combobox/opção OAB/campo de busca, achar o botão
Buscar) agora usam um helper `waitFor` dentro do próprio script injetado
— tenta a cada 200ms por até 3-5s antes de desistir, em vez de checar uma
vez só. `diagnosticarPagina` não mudou de comportamento (continua sendo um
retrato do instante, já que o loop externo de `ensurePortalBearer` já a
chama de novo a cada 10s — esse já era o "retry" certo pra ela). Testado
só com `tsc --noEmit` e checagem de sintaxe do JS injetado (`node
--check`) nesta sessão — ainda não observado ao vivo contra o PDPJ real.

### 3.3 [implementado, 14/08/2026] Timeout rígido + auto-destruição nas janelas do pool de consulta

**Problema hoje**: a correção da v0.3.27 (destruir a janela ao falhar) só
foi aplicada na `authWindow`. As janelas do pool de consulta
(`acquireQueryWindow`/`createQueryWindow`, usadas em paralelo pra buscar
texto de documentos) não têm um limite de tempo claro por operação — se
uma travar (mesmo tipo de loop de redirecionamento, em tese), ela fica
ocupando uma vaga do pool indefinidamente.

**Proposta**: mesmo tratamento da 3.1 — timeout por operação, e destruição
(não reaproveitamento) da janela do pool quando uma operação estoura esse
timeout, liberando a vaga pra uma janela nova.

**Arquivos**: `meujudi-cs/src/main/pdpj-auth.ts` (`acquireQueryWindow`,
`createQueryWindow`, `requestPdpjApi`, `requestPdpjApiBinario`).

**Implementado como**: novo helper `withHardTimeout()` que corre a
promise do `executeJavaScript` contra um teto (timeout interno do fetch +
10s de margem, cobrindo o resto da operação que não tinha limite nenhum).
`release()` do pool ganhou um segundo argumento (`{ destroy: boolean }`)
— em qualquer falha (erro real ou timeout rígido) a janela é destruída e
removida do pool em vez de devolvida como "livre"; só sucesso devolve
normalmente. Isso fecha a mesma classe de bug do item 3.1, mas no pool de
consulta: antes, uma janela que travou continuava sendo "confiada" de
novo na próxima consulta que a pegasse.

### 3.4 [implementado, 14/08/2026] Revalidação proativa antes do horário de pico

**Problema hoje**: a revalidação automática (`maybeValidateApi`, timer de
5min) só age quando o Bearer já está perto de expirar
(`isTokenNearExpiry`, margem de 10min) — é reativa. Se a sessão de
cookies também morreu (como vimos: ~11h sem sessão válida durante a
madrugada), ninguém percebe até a primeira tarefa do dia falhar.

**Proposta**: além do timer de 5min já existente, adicionar uma tentativa
de revalidação garantida num horário fixo antes do expediente (ex.: uma
faixa configurável, hoje o Cron 2/`poll-pdpj-detalhes` já roda 9h-16h BRT
como referência) — se falhar, já dispara o aviso de sessão precisando de
atenção (mecanismo que já existe,
`registrarFalhaValidacaoENotificarSeNecessario`) mais cedo, em vez de só
depois de 15min de falhas seguidas durante o expediente.

**Arquivos**: `meujudi-cs/src/main/pdpj-auth.ts` (`startAutoValidation`,
`maybeValidateApi`), possivelmente `meujudi-cs/src/shared/constants.ts`
(`INTERVALS`).

**Implementado como**: `maybeRunProactiveRevalidation()`, chamado no
início de `maybeValidateApi()` (mesmo timer de 5min, sem timer novo) —
na primeira checagem do dia que cair na hora-alvo (`PROACTIVE_REVALIDATION_HOUR_LOCAL
= 7`, hora local da máquina), força uma revalidação completa via
`ensureApiSession(true)` mesmo com um Bearer que "parece" válido, e marca
o dia como feito (`proactiveRevalidationDoneOnDate`) pra não repetir nas
próximas checagens do mesmo dia. Se não existir sessão de cookies nenhuma,
não tenta nada (só login manual resolve esse caso). Falha na checagem
proativa dispara aviso **na hora** (`avisarFalhaProativaImediatamente`),
diferente do alerta reativo que só notifica depois de 15min de falhas
seguidas — a proativa existe justamente pra pegar o problema antes do
expediente, então esperar 15min pra avisar anularia o propósito.

### 3.5 [implementado, 14/08/2026] Circuit breaker simples, só pra erro de rede real

**Problema hoje**: já existe uma trava boa pra 429 (`registrar429PDPJ`,
`pdpj-concurrency.ts`) — cooldown de 30min, concorrência forçada pra 1.
Não existe equivalente pra 504/502/timeout de rede repetidos. O desenho
anterior (`docs/IMPLEMENTACAO-CIRCUIT-BREAKER-PDPJ.md`, agosto/2026) foi
descartado porque misturava sinal de rede com sinal de lógica/DOM e tinha
números que não batiam com os logs reais.

**Proposta**: um circuit breaker deliberadamente estreito — só conta como
"falha de rede real" status HTTP 502/503/504 ou timeout de conexão (nunca
falha de detecção de DOM, nunca "sessão expirada"). Threshold parecido com
o do 429 (ex.: 2-3 seguidas), cooldown mais curto que 429 (ex.: 5min, não
15min) porque 5xx costuma ser mais transiente que rate-limit.

**Arquivos**: `meujudi-cs/src/main/pdpj-api.ts` (onde os status HTTP já são
tratados), `meujudi-cs/src/main/pdpj-concurrency.ts` (mesmo padrão do
`registrar429PDPJ`).

**Implementado como**: `registrarErroRedePDPJ()`/`registrarSucessoRedePDPJ()`
em `pdpj-concurrency.ts`, espelhando exatamente o padrão do 429 (mesmas
variáveis de cooldown, mesma notificação), mas com threshold de 2
consecutivos (`REDE_ERRO_THRESHOLD`) e cooldown de 5min
(`REDE_COOLDOWN_MS`) em vez de 30min. `getMaxConcurrentPdpj()` e
`getConcurrencyStatus()` passaram a considerar os dois cooldowns (429 e
rede) ao decidir a concorrência efetiva. Em `pdpj-api.ts`: chamado quando
`status` é 502/503/504 (tanto no loop de retry de `request()` quanto em
`buscarBinarioDocumento`, que não tem retry) e quando o erro não veio de
um `PdpjApiError` conhecido (timeout do `AbortController`, falha de rede
crua do fetch); `registrarSucessoRedePDPJ()` roda em toda resposta 2xx,
zerando o contador — só falhas consecutivas *sem nenhum sucesso no meio*
acionam o cooldown.

### 3.6 [implementado, 14/08/2026] Alerta de backlog crescendo, independente de "sessão expirada"

> **Nota de correção**: o plano original citava `reportPendingCount`/
> `StatusReporter.setPendingTasks` como a métrica a usar — inspecionando o
> código antes de implementar, essa métrica mede quantas tarefas **este
> device está processando agora** (limitado pela concorrência, então nunca
> passa de poucas unidades), não o backlog real de tarefas `pending`
> aguardando no servidor. Não serviria pro alerta pretendido. Corrigido
> criando uma fonte de dado nova (ver abaixo) em vez de reaproveitar a
> errada.

**Problema hoje**: o único alerta que existe
(`registrarFalhaValidacaoENotificarSeNecessario`) dispara só quando a
*validação* está falhando. Achamos ontem um cenário onde a sessão estava
tecnicamente saudável (Bearer válido, revalidando com sucesso a cada 5min)
mas a fila `pending` de `pdpj_cnj` continuava crescendo (327 tarefas) por
outro motivo (throughput baixo, não falta de sessão) — esse cenário não
dispara nenhum aviso hoje.

**Proposta**: métrica separada — se a contagem de `pending` (já reportada
via `reportPendingCount`/`StatusReporter`) crescer além de um limiar por
mais que X minutos sem cair, avisa, independente do estado da sessão.

**Arquivos**: `meujudi-cs/src/main/sync-worker.ts` (`reportPendingCount`),
`meujudi-cs/src/main/status-reporter.ts`.

**Implementado como**: nova rota `GET /api/cs/tasks/pending-count?source=pdpj`
(`src/app/api/cs/tasks/pending-count/route.ts`, autenticada por device
token igual ao heartbeat) que conta `sync_tasks` com `status='pending'`
pro tenant do device — número real do servidor, não o que o worker local
tem em mãos. `TaskQueueClient.getPendingCount()` chama essa rota.
`PdpjAuth.maybeCheckPendingBacklog()`, chamado a cada ciclo de 5min
(mesmo timer de `maybeValidateApi`, antes até do `if (!session) return` —
precisa rodar mesmo sem sessão, que é justamente um dos cenários que
motivou isso), avisa se `pendingCount >= 100` (`BACKLOG_ALERT_THRESHOLD`)
por 30min seguidos sem cair (`BACKLOG_ALERT_SUSTAINED_MS`), com cooldown
de 30min pro aviso não repetir. Limiar e janela são grosseiros de
propósito (sem baseline por tenant ainda) — servem pra pegar "a fila não
sai do lugar", não pra ser preciso sobre o que é normal por escritório.

## 4. Ordem de implementação recomendada

1. **3.1** (janelas separadas) e **3.2** (espera com retry) primeiro — são
   a raiz da maior parte dos sintomas vistos nesta investigação (loop de
   redirecionamento, Bearer não capturado a tempo) e não dependem de
   nenhuma decisão de custo/parceria externa.
2. **3.3** (timeout no pool) — mesma lógica da 3.1, aplicada num lugar
   diferente; natural na sequência.
3. **3.5** (circuit breaker de rede) e **3.6** (alerta de backlog) — mais
   isolados, podem entrar em paralelo com o resto.
4. **3.4** (revalidação proativa) — depende de 3.1/3.2 estarem prontos pra
   fazer sentido (não adianta revalidar "proativamente" com o mesmo código
   frágil).

## 5. O que NÃO muda

- O desenho geral continua: BrowserWindow real (nunca node-fetch puro,
  confirmado 06/08/2026 que 100% do tráfego real já ia por Chromium),
  cookies + Bearer capturados por sniffing de header, fila unificada
  (`sync_tasks`) coordenando o trabalho.
- Certificado A1, captura de cookies, fluxo de MFA — nada disso muda.
- Não entra fallback pago (Judit/Escavador) — decisão explícita de não
  fazer isso agora.
