# 29 — Auditoria completa dos logs do MeuJudi Sync (agosto/2026)

> **Status (19/08/2026): auditoria concluída, achados 1 e 2 corrigidos no mesmo dia.**
> Análise de todos os logs disponíveis em `%APPDATA%\MeuJudi CS\logs\`
> (15/07/2026 a 19/08/2026, ~180MB no total, arquivo mais pesado 114MB em
> 13/08). Pedido do Caio: auditoria geral, com foco em scraping (PDPJ).

## Resumo executivo

As correções do plano 28 (docs/roadmap/28-pdpj-auth-robustez.md) estão
funcionando na prática — dados reais confirmam. Mas a auditoria achou
**um bug ativo não relacionado ao plano 28** (loop de reconexão do
Realtime, item 1 abaixo) que hoje é, disparado, o maior gerador de linhas
de log e a explicação mais provável pra qualquer lentidão residual do
app — e **um bug no próprio plano 28** (item 2: a revalidação proativa
nunca disparou nem uma vez, em nenhum log histórico).

## 1. [corrigido, 19/08/2026] 🔴 CRÍTICO — Loop de reconexão do Realtime nunca foi corrigido

**O que é**: `meujudi-cs/src/main/document-requests.ts` reconecta ao
canal Realtime do Supabase a cada 5s quando a conexão cai
(`RECONNECT_DELAY_MS = 5_000`, sem backoff crescente). Esse é o MESMO
problema já diagnosticado na investigação de 14/08/2026 (documentado no
diário, nunca em um roadmap) — foi identificado como causa da explosão do
log de 13/08 (114MB, 1.040.778 linhas só disso), mas **nenhuma correção
chegou a ser implementada**. Ficou só como "próxima ação" que nunca virou
código.

**Evidência agora, em dados reais e recentes**:

| Dia | Ocorrências de "socket Realtime caiu" |
|---|---|
| 13/08 | 1.040.778 |
| 17/08 | 49.969 |
| 18/08 | 922 |
| 19/08 | 0 |

Ainda intermitente e ainda sem nenhuma trava — no dia 17/08 sozinho,
correspondeu a **99% de todas as linhas WARN do dia inteiro**. Quando
acontece, degrada a performance geral do app (mesmo processo Electron
que roda as janelas do PDPJ), exatamente como já era sabido desde 14/08.

**Causa**: `document-requests.ts`, método `scheduleReconnect()` — delay
fixo de 5s, sem limite de tentativas, sem crescer o intervalo quando o
problema persiste.

**Correção recomendada**: backoff exponencial com teto (ex.: 5s → 10s →
20s → ... até um máximo de 2-5min), resetando pra 5s só quando a conexão
realmente fica estável por um tempo (não no primeiro sucesso isolado,
pra não voltar a martelar se a instabilidade for intermitente).

**Arquivo**: `meujudi-cs/src/main/document-requests.ts`
(`scheduleReconnect`, `RECONNECT_DELAY_MS`).

**Implementado como**: backoff exponencial de verdade (`RECONNECT_DELAY_BASE_MS`
5s dobrando a cada tentativa seguida, `RECONNECT_DELAY_MAX_MS` teto de
5min) via novo campo `reconnectAttempts`. O reset do contador só acontece
depois de ficar `SUBSCRIBED` por `STABLE_CONNECTION_RESET_MS` (30s)
seguidos sem cair de novo (`stabilityTimer`) — evita resetar cedo demais
numa conexão "flapping" e voltar a martelar. `teardown()` agora também
limpa esse timer de estabilidade.

## 2. [corrigido, 19/08/2026] 🟠 A revalidação proativa (item 3.4 do plano 28) nunca disparou

**O que é**: implementada em 14/08/2026 pra garantir uma revalidação de
sessão bem-sucedida antes do expediente (`PROACTIVE_REVALIDATION_HOUR_LOCAL
= 7`, dispara na primeira checagem de 5min que cair na hora 7 local).

**Evidência**: busquei a string de log dessa função
(`"revalidacao proativa"`) em **todo o histórico de logs disponível** —
zero ocorrências, em nenhum arquivo, nunca.

**Causa raiz**: a condição é `if (now.getHours() !== PROACTIVE_REVALIDATION_HOUR_LOCAL) return;`
— exige a hora **exatamente igual** a 7. Mas o app só é aberto quando o
usuário liga o computador — confirmado nos logs, isso acontece
consistentemente **entre 11:05 e 11:15 UTC (08:05-08:15 BRT)**, ou seja,
depois das 7h já ter passado. Como o app não estava rodando às 7h, a
janela de oportunidade simplesmente não existiu naquele dia — e a
condição de igualdade estrita nunca dá outra chance depois disso.

**Consequência prática**: o problema que esse recurso foi criado pra
evitar continua acontecendo todo dia — sessão sem revalidar logo cedo,
tarefas pausando em lote pouco depois do app abrir (confirmado: 61
tarefas `pdpj_cnj` pausadas às 11h UTC em 19/08, 9 em 18/08, mesmo
horário do início do app nos dois dias).

**Correção recomendada**: trocar `!==` por uma checagem de "já passou da
hora-alvo hoje e ainda não rodou" (`now.getHours() >= PROACTIVE_REVALIDATION_HOUR_LOCAL`,
mantendo o controle por `proactiveRevalidationDoneOnDate` que já existe
pra não repetir no mesmo dia). Assim, mesmo se o app abrir às 8h, 9h ou
qualquer hora depois das 7h, a primeira checagem do dia já dispara a
revalidação proativa, em vez de nunca disparar.

**Arquivo**: `meujudi-cs/src/main/pdpj-auth.ts` (`maybeRunProactiveRevalidation`).

**Implementado como**: exatamente a troca proposta —
`now.getHours() < PROACTIVE_REVALIDATION_HOUR_LOCAL` no lugar de `!==`.
O controle por `proactiveRevalidationDoneOnDate` não mudou, então
continua rodando só 1x por dia.

## 3. 🟢 Confirmado: as correções do plano 28 estão funcionando

Comparando antes/depois dos releases v0.3.27-v0.3.29:

| Métrica | Antes (08-10/11) | Depois (08-18/19) |
|---|---|---|
| Taxa de sucesso `pdpj_cnj` | ~0% (100% `paused_login_required`) | 85-98% completadas |
| Loop de redirecionamento www.jus.br | 300+ navegações por episódio | 4-5 por dia |
| Janelas destruídas por timeout (pool) | N/A (recurso não existia) | 28 em 17/08 (funcionando) |
| Alerta de erro de rede (circuit breaker) | N/A (recurso não existia) | disparou corretamente (32x em 17/08, 11x em 19/08) |
| Alerta de backlog | N/A (recurso não existia) | disparou corretamente (13x em 17/08, 6x em 19/08) |

Os dias ainda com sessão pausando (ex.: 187 tarefas em 19/08) mostram um
padrão **concentrado numa única hora** (11h UTC, logo após o app abrir) —
não distribuído o dia todo. Isso bate exatamente com o achado do item 2
acima: sem a revalidação proativa funcionando de verdade, a primeira
sessão do dia ainda tropeça antes de estabilizar.

## 4. Confirmado: instabilidade real do PDPJ existe, e já é bem tratada

Erros HTTP 502/503/504 reais (não confundir com durações em ms que têm
esses números por coincidência):

| Dia | Erros de gateway reais |
|---|---|
| 12/08 | 181 |
| 13/08 | 310 |
| 17/08 | 66 |
| 18/08 | 2 |
| 19/08 | 16 |

Achado novo: em 19/08 apareceu pela primeira vez um **503 com corpo JSON
de verdade** vindo do próprio PDPJ (`"error":"Service Unavailable",
"message":"Serviço indisponível, tente novamente mais tarde"`) — diferente
da página HTML genérica do CloudFront vista antes. Confirma que a
instabilidade não é só na borda (CDN), é também na aplicação do PDPJ em
si, às vezes. Nenhuma ação necessária aqui — o circuit breaker (item 3.5
do plano 28) e o retry com jitter já lidam com isso corretamente, e o log
mostra os dois mecanismos disparando como esperado.

**Nunca foi visto HTTP 429** (rate limit explícito) em nenhum dia
analisado — a concorrência automática está bem calibrada, não parece
estar sendo agressiva demais com o PDPJ.

## 5. Achados menores, sem ação necessária

- **Diferencial de update falhou 1x** (checksum sha1 não bateu,
  `electron-updater` caiu pro download completo sozinho — comportamento
  correto de fallback, só registrando que aconteceu).
- **Timeout de conexão ao checar update** (5x em 17/08, antes do proxy
  próprio existir) — auto-recuperável no próximo ciclo.
- **Falha simultânea de tudo que fala com o servidor MeuJudi** (heartbeat,
  claim de tarefas, ConfirmADV, backlog) por alguns minutos em 17/08 —
  padrão de uma queda de internet/servidor real e breve, não um bug —
  tudo se recuperou sozinho quando a conexão voltou.
- **Mural e DataJud**: nenhum erro relevante nos últimos dias — só o
  cenário de "tudo caiu junto" acima, que não é específico deles.

## 6. Status

Itens 1 e 2 implementados no mesmo dia da auditoria (19/08/2026), ambos
com `tsc --noEmit` limpo. Nenhuma versão nova publicada ainda — falta
compilar e subir um release com as duas correções.
