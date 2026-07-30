# Plano de robustez do MeuJudi Sync — janela oculta, resiliência, visibilidade de erro

Documento de planejamento (30/07/2026), a partir de uma conversa sobre os
riscos de rodar o MeuJudi Sync como app Electron com janelas ocultas num
único PC de escritório. Cada item abaixo tem: o problema, a solução
proposta, e a decisão tomada. Nada aqui foi implementado ainda — é o plano
pra próxima rodada de trabalho.

## 1. Janelas ocultas consumindo RAM/CPU o tempo todo

**Problema:** o pool de janelas de consulta (`pdpj-auth.ts`,
`MAX_QUERY_WINDOWS = 2`) fica aberto pra sempre depois de criado — cada
janela é um processo Chromium completo, mesmo invisível. Em PC de
escritório mais fraco isso pode pesar, principalmente somado ao navegador
normal do usuário.

**Solução:** fechar janelas do pool depois de um período ocioso (proposta
inicial: 15 minutos sem uso) e recriar sob demanda na próxima consulta.
Efeito prático: só a primeira consulta depois de um período parado paga um
"pedágio" de ~2-4s a mais (recriar janela, aplicar cookies, esperar
carregar); consultas em sequência continuam tão rápidas quanto hoje,
porque a janela recém-criada fica reaproveitada enquanto há atividade.

**Decisão:** implementar, com timeout de 15min (ajustável depois de medir
na prática).

## 2. Vazamento de memória (já aconteceu um, pode voltar a acontecer)

**Problema:** já achamos e corrigimos um vazamento real nesse pool de
janelas nesta sessão (janela órfã em erro de navegação). Sem uma rede de
segurança, um vazamento futuro (não previsto) degrada o app até travar,
sem aviso.

**Solução:** checagem periódica (ex: a cada 10min) do uso de RAM (RSS) do
processo. **Não é reinício agendado** — só age (via `app.relaunch()`) se a
memória ultrapassar um limite claramente anormal (proposta inicial:
~800MB, ajustável). Em operação saudável isso não deve disparar nunca; é
uma rede de segurança pra quando aparecer um bug, não uma rotina de
manutenção.

**Decisão:** implementar como rede de segurança por limite de memória
(nunca por tempo fixo).

## 3. GPU/driver ruim causando crash

**Problema:** o Electron usa aceleração de GPU por padrão, mesmo pra
janela invisível. Em PC com driver de vídeo desatualizado, isso pode
causar crash do processo de GPU e derrubar as janelas junto.

**Solução:** `app.disableHardwareAcceleration()`. O app não tem nada
visualmente pesado (é status/configuração), então não há perda
perceptível — só elimina essa classe inteira de crash.

**Decisão:** implementar.

## 4. Instalador sem assinatura digital (SmartScreen, bloqueio por política de TI)

**Problema:** o instalador não é assinado — o Windows mostra aviso de
SmartScreen na primeira execução, e políticas de TI mais restritivas
(AppLocker/WDAC) podem bloquear a instalação de um app não assinado.

**Solução:** comprar certificado de assinatura de código. Duas famílias de
opção, nenhuma é compra única — ambas recorrentes:
- Certificado tradicional (OV/EV) de CAs como DigiCert/Sectigo/GlobalSign —
  cobrança **anual**, exige verificação de identidade da empresa
  (documentos, telefone), emissão pode levar dias.
- Microsoft/Azure Trusted Signing — cobrança **mensal**, tende a ser mais
  barato, mas tem requisitos de elegibilidade (ex: tempo mínimo de
  empresa registrada) a confirmar.

Preço exato não foi cotado — muda com frequência e varia por revendedor;
precisa cotar direto antes de decidir.

**Decisão:** em aberto — decisão de custo do Caio, fora do escopo técnico
imediato.

## 5. Antivírus corporativo desconfiando de processo oculto com rede

**Problema:** um processo Electron oculto fazendo requisições HTTPS pra
vários domínios (jus.br, PDPJ, Supabase) é o tipo de padrão que
antivírus/EDR mais agressivo pode sinalizar como suspeito.

**Solução:** não existe correção automática — o que ajuda é (a) a
assinatura digital do item 4 (é o fator que mais pesa nas heurísticas), e
(b) um documento simples explicando quais domínios o app acessa, **lido
manualmente por um humano de TI** do escritório, que configura a exceção
no firewall/EDR dele mesmo. Não é algo que o antivírus "consulta"
automaticamente — é material de apoio pra pessoa configurar.

**Decisão:** baixo esforço, fazer quando começarmos a instalar em mais de
um escritório (não urgente agora, só um tenant real).

## 6. Proxy corporativo com autenticação

**Problema:** se algum escritório usa proxy com autenticação pra sair na
internet, o Electron não pega credencial de proxy automaticamente — o app
falharia silenciosamente nessa rede.

**Solução:** o Electron tem um evento pronto (`app.on('login', ...)`) que
dispara quando um proxy pede autenticação — dá pra construir uma tela
simples de configuração de proxy (usuário/senha, guardado criptografado)
quando isso virar necessário de verdade.

**Decisão:** registrado como backlog — não implementar agora, sem caso
real que precise.

## 7. WebSocket bloqueado por firewall/proxy (quebraria o Realtime)

**Problema:** alguns proxies corporativos não sustentam o "upgrade" HTTP
pra WebSocket, mesmo com HTTPS normal funcionando — isso quebraria o aviso
instantâneo via Realtime (visualizar/baixar documento sob demanda).

**Mitigação já existente:** o pedido de documento sob demanda já tem um
poll de reforço a cada 4s (`DOCUMENT_REQUEST_FALLBACK_POLL_MS`, ver
`process-details-modal.tsx`) independente do Realtime, e a fila normal de
sync continua no poll de 30s de sempre. Nesse cenário o sistema não para,
só fica mais lento.

**Decisão:** sem ação nova por enquanto — a rede de segurança já existe.
Melhoria futura possível: indicador visual "Realtime indisponível, modo
mais lento" em vez de ficar silencioso.

## 8. Rate limit do PDPJ por IP compartilhado

**Problema:** se vários dispositivos do mesmo escritório saem pelo mesmo
IP público, uso combinado pode esbarrar em limite de taxa do PDPJ. A
mensagem de erro no pedido sob demanda hoje é genérica.

**Solução:** mapear erro 429/retryable pra uma mensagem clara ("PDPJ com
limite temporário, tente de novo em instantes") no fluxo de documento sob
demanda — a fila em lote já trata isso (`paused_rate_limit`).

**Decisão:** implementar.

## 9. Sessão RDP desconectada travando as janelas

**Problema:** se o PC roda o Sync e é acessado via Remote Desktop, uma
sessão RDP "desconectada" (sem logoff completo) pode suspender
renderização/GPU daquela sessão no Windows, travando as janelas ocultas
até alguém reconectar.

**Solução:** usar `powerMonitor` do Electron (eventos de
suspensão/retomada, tela travada/destravada) pra forçar reconexão do
Realtime e revalidação da sessão do PJe assim que a máquina "acorda", em
vez de esperar os timers normais perceberem sozinhos.

**Decisão:** implementar.

## 10. Sem captura global de erro não tratado

**Problema:** não existe `process.on('uncaughtException')` /
`unhandledRejection` cobrindo o processo inteiro. Já vimos esse padrão
acontecer de verdade (o crash do WebSocket do Realtime) — sem essa rede, o
app trava com o diálogo de erro do Electron e o sync fica parado até
alguém notar e reabrir manualmente.

**Solução:** registrar os handlers globais no startup (`index.ts`),
logando via `recordDiagnosticEvent` e tentando `app.relaunch()` em vez de
deixar o diálogo parado.

**Decisão:** implementar.

## 11. Atualização 100% manual

**Problema:** o pacote `electron-updater` está instalado mas nunca foi
configurado — toda atualização até hoje exigiu build manual + reinstalação
manual (o que fizemos várias vezes nesta própria sessão).

**Solução:** configurar `autoUpdater` apontando pra um feed de releases
(GitHub Releases funciona nativamente com `electron-builder`/
`electron-updater`), chamando `checkForUpdatesAndNotify()` no início e
periodicamente. Nota: atualização automática sem assinatura de código
tende a gerar mais atrito/aviso do Windows — meio que empurra a decisão do
item 4 junto.

**Decisão:** implementar.

**Implementado (30/07/2026).** Decisão de hospedagem: repo novo e
**público**, separado do código (`MeuJudi/MeuJudi-Sync-Releases`), com só
os artefatos do instalador (`.exe` + `latest.yml`) — nunca código-fonte.
Motivo de ser público: cogitamos GitHub Releases no repo privado
`MeuJudi/MeuJudi` (exigiria embutir um token no app) e um GitHub App
instalado nesse mesmo repo (mesmo problema — a permissão "Contents" de um
GitHub App não separa "só releases" de "todo o código", então o token
ainda daria acesso de leitura ao repo inteiro). Como o conteúdo do repo
novo é só o instalador — o mesmo binário que qualquer cliente já recebe
ao instalar — deixá-lo público não expõe nada de novo e elimina a
necessidade de gerenciar/rotacionar token nenhum.

- `meujudi-cs/src/main/auto-updater.ts` (novo): `initAutoUpdater()`,
  chamado uma vez no `app.whenReady()` de `index.ts`. Só roda com
  `app.isPackaged` (não faz nada em dev). Checa 30s depois do start e
  depois a cada `INTERVALS.updateCheck` (6h). Download automático; a
  instalação só acontece no próximo reinício natural do app
  (`autoInstallOnAppQuit`, padrão do electron-updater) — não força
  restart no meio do expediente.
- `package.json`: `build.publish = { provider: "github", owner:
  "MeuJudi", repo: "MeuJudi-Sync-Releases" }`.
  `win.verifyUpdateCodeSignature: false` já estava setado (necessário
  porque o instalador ainda não é assinado, item 4).
- Processo de release ainda é manual, e **sempre exige as duas builds**
  (descoberto ao testar: o instalador "assistido" mostra a janela do
  wizard mesmo durante update automático, porque é assim que `oneClick:
  false` funciona no NSIS — não tem como pular isso mantendo esse modo):
  1. `npm run dist:win` — instalador assistido em `release/`, pro
     download inicial (Super Admin / tenant). Não é usado pelo
     autoUpdater.
  2. `npm run dist:win:update` — instalador "um clique" (`oneClick:
     true`, silencioso) em `release-update/`, nome
     `MeuJudi-Sync-AutoUpdate-v<versão>.exe`. É esse + o `latest.yml`
     dele que o autoUpdater de quem já tem o Sync consome.
  3. Sobem os artefatos das duas builds (instalador assistido +
     instalador silencioso + `latest.yml` da build silenciosa) juntos
     no mesmo Release (tag `v<versão>`) no repo `MeuJudi-Sync-Releases`.
  Esquecer a build silenciosa numa release quebra o auto-update de quem
  já tem o Sync instalado (o `checkForUpdates()` falha sem `latest.yml`
  no Release mais recente).
- Erros de checagem/download de update só geram `recordDiagnosticEvent`
  (log local) — ainda não sobem pro Supabase nem aparecem pro Super
  Admin. Isso só fica coberto quando o item 15 (nenhum erro silencioso)
  for implementado.

**Consolidação com o Super Admin (30/07/2026).** Descobrimos, ao implementar
isso, que já existia um sistema pronto de antes desta sessão —
`/admin/cs-releases` — pra Super Admin publicar versões do instalador
(usado no link "Baixar MeuJudi Sync" de `/configuracoes/meujudi-cs`). Ele
também usa um GitHub App + GitHub Releases, mas apontava por padrão pro
repo **privado** `MeuJudi/MeuJudi` (`GITHUB_RELEASE_OWNER`/
`GITHUB_RELEASE_REPO` em `.env.example`) — o mesmo problema de exposição
de código-fonte discutido acima, e um link de download que provavelmente
não funcionava pra um tenant sem conta GitHub com acesso ao repo privado
(GitHub bloqueia download anônimo de asset de Release privado).

Resolvido reapontando os dois sistemas pro mesmo repo público
`MeuJudi/MeuJudi-Sync-Releases`:
- `.env.example`: `GITHUB_RELEASE_REPO` mudou de `MeuJudi` para
  `MeuJudi-Sync-Releases` (precisa também atualizar a env var real na
  Vercel — não é algo que dá pra automatizar daqui).
- O GitHub App usado por `/admin/cs-releases` precisa ser instalado
  nesse repo novo também (Settings → Installations → Configure no
  GitHub, ação manual, só o dono da conta consegue fazer).
- Adaptado (não removido) o fluxo "Arquivo versionado no Git" do
  formulário de `/admin/cs-releases`: antes (`listTrackedCsInstallers`/
  `publishTrackedCsInstaller`) ele listava `.exe` já commitados dentro de
  `meujudi-cs/release/` no próprio repo de código — deixou de fazer
  sentido já que instaladores não são mais commitados ali. Trocado por
  `listGithubReleases`/`adoptGithubRelease`, que listam Releases já
  publicados de verdade no `MeuJudi-Sync-Releases` (via API de Releases,
  não a de Contents) — útil pra adotar no painel um Release feito direto
  por `gh release upload` (como os que fizemos nesta sessão) sem precisar
  re-enviar o arquivo pelo navegador.
- `.gitignore` (raiz e `meujudi-cs/`) não força mais o rastreio de novos
  `.exe`/`.blockmap` em `meujudi-cs/release/` — instaladores publicados a
  partir de agora só existem como asset de Release, não commitados no
  histórico do repo de código. Builds antigos já commitados continuam
  rastreados (mudança de `.gitignore` não destrata arquivo já versionado).

## 12. App por conta de usuário do Windows, não por máquina

**Problema:** a sessão pareada fica salva na pasta de configuração da
conta específica do Windows que instalou/pareou o app — não é
compartilhada entre contas do mesmo PC.

**Correção importante:** travar a tela (Win+L) **não afeta isso** — o
Windows mantém processos em segundo plano rodando normalmente com a tela
travada. O risco real é só **logoff completo** ou troca pra outra conta do
Windows no mesmo PC — aí o sync para até alguém logar de volta na conta
certa.

**Solução prática (não é mudança de código):** parear numa conta do
Windows dedicada pro Sync, com login automático do Windows habilitado, em
vez de uma conta pessoal sujeita a logoff.

**Decisão:** documentar como recomendação de instalação.

## 13. PC desligado à noite

**Problema:** se a política do escritório for desligar o PC fora do
expediente, o sync não roda nesse período.

**Decisão:** já decidido pelo Caio (fora do escopo técnico deste
documento) — não é uma mudança de código, é uma escolha operacional.

## 14. Ponto único de falha (um PC só)

**Problema:** hoje uma única máquina é o ponto único de falha pra tudo
relacionado a PDPJ (sync em lote e visualizar/baixar documento). Se essa
máquina quebrar, for formatada ou roubada, precisa reinstalar, parear de
novo e logar no PJe de novo antes de qualquer coisa voltar a funcionar.

**Boa notícia:** o banco já foi desenhado sem travar em um único
dispositivo — `cs_devices`, `sync_tasks` e `document_fetch_requests` não
têm nenhuma restrição de "só um device por tenant". Em princípio já dá pra
parear um segundo PC como backup hoje, sem mudar código nenhum.

**Decisão:** testar na prática — parear um segundo dispositivo do mesmo
tenant e confirmar que a fila reparte direito entre os dois (claim atômico
já devia garantir isso, mas nunca foi testado com 2 devices reais
simultâneos).

## 15. Nenhum erro pode falhar silenciosamente (novo requisito)

**Problema (estado atual, conferido no código):**
`recordDiagnosticEvent()` (`logger.ts`) só guarda o evento **em memória
local** do processo do CS (`recentEvents`, limitado a
`MAX_RECENT_EVENTS`) — nunca sobe sozinho pro Supabase. Só sobe quando um
diagnóstico completo roda de propósito (`diagnostic.ts::run()`, chamado
hoje só depois de falha de login e em alguns fluxos específicos) e chama
`enviarRelatorioSupabase()` manualmente. Ou seja: a maioria dos erros hoje
fica só no arquivo de log local do PC, sem ninguém do time saber que
aconteceu, a não ser que alguém abra o log manualmente (como fizemos a
sessão inteira).

**Requisito do Caio:** nenhum erro pode ficar invisível — precisa aparecer
(1) numa tela do Super Admin pra ser resolvido, e (2) como aviso visual na
tela de quem está usando o MeuJudi Sync naquele PC.

**Solução proposta:**
1. Todo evento com `status: 'error'` em `recordDiagnosticEvent` dispara
   automaticamente um envio assíncrono (fire-and-forget, com retry) pro
   Supabase — não mais dependente de um diagnóstico completo ser
   disparado. Tabela: reaproveitar `diagnostic_reports` (já existe e já é
   usada por `supabase-reporter.ts`) ou criar uma tabela mais leve
   `cs_error_events` só pra isso, mais barata de escrever a cada erro.
2. Página de Super Admin: estender a já existente
   `src/app/(super-admin)/admin/cs-diagnostics/page.tsx` (ou criar uma
   nova seção) pra listar esses erros por tenant/device, com estado
   resolvido/não-resolvido pra alguém marcar como tratado.
3. No próprio MeuJudi Sync: aviso visual quando um erro acontecer — ícone
   da bandeja mudando de cor/estado (já existe lógica de status na
   `tray.ts`) e/ou notificação balão do Windows, não só log.

**Decisão:** implementar — esforço médio-alto (toca CS, Web e banco).
Ainda não escopado em tarefas menores; próxima etapa é quebrar isso em
passos concretos antes de codar.

## Resumo — o que entra na próxima rodada de implementação

Itens com decisão "implementar", em ordem sugerida por custo/benefício:

1. Captura global de erro não tratado (10) — mais barato, resolve o
   sintoma mais provável.
2. Desligar aceleração de GPU (3) — mais barato, sem trade-off.
3. Nenhum erro silencioso — visibilidade Super Admin + aviso na tela (15)
   — o mais importante pro Caio, mas o de maior esforço.
4. Rate limit com mensagem clara (8) — pequeno.
5. Reconexão ao acordar de suspensão/RDP (9) — médio.
6. Vazamento de memória — rede de segurança por limite (2) — médio.
7. Janelas ociosas fechando sozinhas (1) — médio, precisa medir o timeout
   certo na prática.
8. ~~Atualização automática (11)~~ — **implementado em 30/07/2026** (repo
   público separado `MeuJudi-Sync-Releases`, ver detalhes no item 11).

Fora da lista de código: assinatura digital (4, decisão de custo),
documento pra TI (5, baixa prioridade com 1 tenant só), proxy corporativo
(6, backlog sem caso real), conta de usuário dedicada (12, recomendação de
instalação), PC desligado à noite (13, já decidido), segundo device de
backup (14, teste, não código).
