/**
 * MeuJudi Sync — PJeAuth (v4 — login via PDPJ/Jus.br)
 *
 * v4: a entrada do login mudou de "montar a URL do Keycloak na mão" pra
 * "abrir o jus.br e deixar o próprio site guiar o fluxo" — o acesso de
 * usuário externo virou exclusivo via PDPJ-Br (abr/2025) e passou a exigir
 * MFA por e-mail (nov/2025), o que quebrou o atalho direto (caía em
 * "/pjekz/acesso-negado" mesmo com certificado e SSO funcionando —
 * confirmado nos logs em 27/07/2026). O resto do fluxo (seleção de
 * certificado, captura de cookies, detecção de login completo) continua
 * igual — o jus.br acaba devolvendo o usuário pro PJe do tribunal já
 * autorizado, então os mesmos listeners funcionam sem alteração.
 *
 * Melhorias mantidas da v3:
 * 1. Listener de `select-client-certificate` (pega o popup do cert. A1)
 * 2. Listener de `certificate-error` (não trava se cert. tiver problema)
 * 3. Polling de URL a cada 1s (pega pushState do Angular, não só navegação real)
 * 4. Listener de `did-fail-load` com tratamento de `ERR_BAD_SSL_CLIENT_AUTH_CERT`
 * 5. Logs super detalhados em cada etapa
 * 6. Múltiplas tentativas de extrair userId (tenta cookie Keycloak, JWT, perfil, etc)
 * 7. Não fecha a janela em caso de erro (deixa usuário tentar de novo, ou
 *    completar uma etapa de MFA que o jus.br peça no meio do caminho)
 *
 * Gerencia o login via BrowserWindow interna do Electron.
 * - Abre janela no jus.br (PDPJ)
 * - Monitora navegação + polling de URL (detecta login completo no PJe)
 * - Extrai cookies via webContents.session.cookies.get()
 * - Salva via cookieStore (criptografado)
 * - Fornece callPJeAPI() que injeta cookies + XSRF automaticamente
 */

import { BrowserWindow, Notification, session as electronSession } from 'electron';
import { CookieStore } from './cookie-store';
import { getMaxConcurrentPdpj } from './pdpj-concurrency';
import { loadAppIcon } from './app-icon';
import { TaskQueueClient } from './task-queue-client';
import { logger, recordDiagnosticEvent } from './logger';
import { PDPJ_LOGIN_URL, TIMEOUTS, INTERVALS, MEUJUDI_WEB_URL, APP_NAME } from '../shared/constants';
import type { Pairing } from './pairing';
import type { PdpjSession, PublicSession, SerializedCookie } from '../shared/types';

const PDPJ_COOKIE_HOSTS = new Set([
  'www.jus.br',
  'sso.cloud.pje.jus.br',
  'sso.acesso.gov.br',
  'portaldeservicos.pdpj.jus.br',
]);
const URL_POLL_INTERVAL_MS = 1000;
const COOKIE_WAIT_MS = 1500; // espera Angular setar cookies HttpOnly
const COOKIE_CAPTURE_TIMEOUT_MS = 30_000;
const COOKIE_CAPTURE_RETRY_MS = 1000;
const PDPJ_PORTAL_URL = 'https://portaldeservicos.pdpj.jus.br/';
// Achado em log real (29/07/2026): depois do clique em "Consultar
// processos", o Portal às vezes faz uma reautenticação silenciosa via SSO
// (prompt=none) que redireciona de volta pro Portal com um novo `code` na
// URL — mas a SPA (Angular) pode levar mais que os 20s antigos pra
// terminar de carregar e disparar a primeira chamada autenticada.
const BEARER_CAPTURE_TIMEOUT_MS = 45_000;
const BEARER_CAPTURE_RETRY_MS = 500;
// Teto de segurança sobre a operação INTEIRA de `ensurePortalBearer`, não
// só o loop interno. Achado 17/08/2026, ao vivo: `startedAt` (a base do
// timeout de 45s acima) só é marcado DEPOIS do `loadURL(PDPJ_LOGIN_URL)`
// inicial — se a página entrar no loop de redirecionamento em
// www.jus.br logo nessa carga inicial (antes do loop nem começar), ou se
// os `executeJavaScript` do loop ficarem lentos por causa da própria
// página navegando sem parar (visto: 300 navegações em 157s numa única
// tentativa), o tempo real passa longe dos 45s nominais — chegou a 157s
// numa tentativa real. Isso envolve `withHardTimeout` (já usado no pool
// de consulta, item 3.3) por fora da chamada inteira, garantindo um teto
// de verdade independente de onde o tempo está sendo gasto por dentro.
const ENSURE_PORTAL_BEARER_HARD_TIMEOUT_MS = 70_000;
// Circuit breaker específico pra falha em CAPTURAR O BEARER — categoria
// própria, sem misturar com erro de rede (já tem o seu em
// pdpj-concurrency.ts) nem com "sem sessão salva" (já é barato, nunca
// chega a abrir janela). Achado ao vivo em 21/08/2026: sem esse freio,
// cada tarefa pdpj_cnj pendente redispara `ensureApiSession()` assim que
// a tentativa anterior termina (24ms de intervalo observado no log) —
// 10 tentativas seguidas, cada uma travando os `ENSURE_PORTAL_BEARER_HARD_TIMEOUT_MS`
// (70s) inteiros, ~13min de janelas abrindo sem parar e sem nunca dar
// uma folga pro jus.br. Ver docs/roadmap/28-pdpj-auth-robustez.md, item
// 3.5, mesmo raciocínio aplicado a essa categoria de falha.
const VALIDATION_FAILURE_THRESHOLD = 3;
const VALIDATION_COOLDOWN_MS = 5 * 60_000;
// Achado (29/07/2026, 3a rodada, via diagnostico de estrutura da pagina): o
// Portal so dispara a chamada autenticada apos uma busca de verdade — a
// pagina sozinha nunca chama a API. A busca principal usa a OAB vinculada
// ao escritorio (generica, funciona pra qualquer tenant — ver getLinkedOab).
// Esse CNJ so serve de ultimo recurso, quando o escritorio ainda nao tem
// OAB vinculada ou a busca por OAB falha por qualquer motivo — qualquer CNJ
// com o formato certo funciona (a resposta e sempre descartada, so
// precisamos do cabecalho Bearer), por isso e um valor generico, nao o
// processo de tenant nenhum.
const BEARER_PRIME_CNJ_FALLBACK = '0000001-01.2024.8.26.0100';
// O fluxo OAuth do Portal PDPJ ja esta estavel (ver cs-pdpj-login-fix.md) —
// a janela tecnica de renovacao/validacao da sessao fica sempre oculta,
// sem roubar foco. So a janela de LOGIN inicial (showLoginWindow) e
// visivel; a home publica do jus.br nunca deve abrir sozinha na frente do
// usuario. Ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 5.
// DevTools automatico foi usado (31/07/2026) pra investigar a captura do
// Bearer e a coleta de CNJ/documento via HAR — desligado de novo agora
// que o log normal passou a incluir durationMs por requisicao (v0.3.15),
// cobrindo o que antes só o HAR dava. Não é assim que deve rodar em
// produção (a janela técnica nunca deveria aparecer nem ter DevTools
// aberto sozinha na frente do usuário).
const SHOW_PDPJ_VALIDATION_WINDOW = false;
const OPEN_DEVTOOLS_NA_JANELA_TECNICA = false;
// A sessão de cookies (login no PJe/Keycloak) e o Bearer da API são coisas
// diferentes, com tempos de vida diferentes — o Bearer é de propósito
// curto (o `exp` real dele, lido do próprio JWT, costuma ser bem menor),
// mas a sessão de cookies via SSO tende a durar bem mais. Antes os dois
// eram tratados como a mesma coisa (8h fixas), e pior: quando esse prazo
// inventado passava, `CookieStore.getValidSession()` deletava os cookies
// junto — mesmo que a sessão real no PJe ainda estivesse válida. Agora só
// os cookies têm um prazo generoso (achado real 30/07/2026); o Bearer usa
// o `exp` de verdade do JWT, e a revalidação automática (`maybeValidateApi`)
// passa a reagir a esse prazo real, não só a "token vazio".
const SESSION_COOKIES_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const TOKEN_FALLBACK_TTL_MS = 8 * 60 * 60 * 1000; // só se o JWT não puder ser decodificado
const TOKEN_REFRESH_MARGIN_MS = 10 * 60 * 1000; // revalida um pouco antes do Bearer expirar de verdade
// Hora local da máquina em que roda a revalidação proativa (1x por dia,
// só na primeira checagem de 5min que cair nessa hora) — antes do início
// do expediente (Cron 2/poll-pdpj-detalhes roda 9h-16h BRT como
// referência), pra já chegar com sessão confirmada em vez de descobrir
// que ela morreu só quando a primeira tarefa do dia falhar. Ver
// docs/roadmap/28-pdpj-auth-robustez.md, item 3.4.
const PROACTIVE_REVALIDATION_HOUR_LOCAL = 7;
// Alerta de backlog crescendo — independente do estado da sessão (achado
// 14/08/2026: fila com 327 tarefas `pdpj_cnj` presas em `pending` enquanto
// a sessão revalidava com sucesso a cada 5min; o único alerta que existia
// até então só reagia a falha de validação, então esse cenário nunca
// disparava nada). Limiar e janela de sustentação deliberadamente
// grosseiros (sem baseline por tenant ainda) — servem pra pegar "a fila
// não sai do lugar", não pra ser preciso sobre "quanto é normal" pra cada
// escritório. Ver docs/roadmap/28-pdpj-auth-robustez.md, item 3.6.
const BACKLOG_ALERT_THRESHOLD = 100;
const BACKLOG_ALERT_SUSTAINED_MS = 30 * 60_000; // precisa ficar acima do limiar por 30min seguidos
const BACKLOG_NOTIFICACAO_COOLDOWN_MS = 30 * 60_000; // não repete o aviso por 30min

/** Lê o `exp` de dentro do próprio JWT (payload base64url) — sem depender de suposição nossa sobre validade. */
function decodeJwtExpiry(token: string): Date | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    return typeof decoded.exp === 'number' ? new Date(decoded.exp * 1000) : null;
  } catch {
    return null;
  }
}

/** Sem `tokenExpiresAt` (sessão antiga) trata como expirado — força revalidação em vez de confiar cego. */
function isTokenNearExpiry(tokenExpiresAt?: Date): boolean {
  if (!tokenExpiresAt) return true;
  return tokenExpiresAt.getTime() - Date.now() <= TOKEN_REFRESH_MARGIN_MS;
}

interface QueryWindowSlot {
  window: BrowserWindow;
  busy: boolean;
  /** Quando ficou livre pela última vez (Date.now()) — usado pelo sweep de ociosidade. Só é lido quando `busy = false`. */
  idleSince: number;
}

// Docs/roadmap/26-pdpj-concorrencia-inteligente.md Parte A, extensão
// 04/08/2026: o pool crescia sozinho até o teto calculado, mas nunca
// encolhia — nem fechava janela parada, nem devolvia RAM se o teto caísse
// depois (RAM ficou mais escassa) ou se o volume de tarefas baixasse. O
// sweep (chamado no mesmo timer de 5min de `maybeValidateApi`) resolve os
// dois casos: fecha janela livre ociosa há mais de `POOL_IDLE_TIMEOUT_MS`, e
// fecha o excedente livre se o teto atual for menor que o pool de agora.
const POOL_IDLE_TIMEOUT_MS = 5 * 60_000;
// Margem sobre o timeout interno do fetch (TIMEOUTS.pdpjChromiumRequest/
// pdfDownload, que só cobre a chamada de rede em si) — cobre o resto da
// operação (dismissGuidedNavigationModal + o dispatch do executeJavaScript
// pro processo renderer), que não tinha limite próprio nenhum. Achado
// 14/08/2026: se a janela travar antes mesmo do fetch começar (ex.: presa
// no meio de uma navegação), a operação inteira ficava sem teto, prendendo
// a vaga do pool pra sempre — ver docs/roadmap/28-pdpj-auth-robustez.md,
// item 3.3.
const POOL_OPERATION_TIMEOUT_MARGIN_MS = 10_000;

/**
 * Teto de janelas ocultas dedicadas a consultas em paralelo — ver
 * docs/roadmap/22-extracao-pdpj-e-fila-cs.md. Ajustável em teste
 * controlado via `getMaxConcurrentPdpj()` (pdpj-concurrency.ts) — não é
 * mais uma constante fixa desde 31/07/2026.
 */
export { getMaxConcurrentPdpj as getMaxQueryWindows } from './pdpj-concurrency';

export class PdpjAuth {
  private authWindow: BrowserWindow | null = null;
  // Janela técnica dedicada à revalidação em segundo plano
  // (doEnsureApiSession/ensurePortalBearer) — nunca mais a mesma instância
  // que `authWindow` (achado 14/08/2026: compartilhar as duas era a causa
  // de fundo do loop de redirecionamento que travou o app por 10min+;
  // ver docs/roadmap/28-pdpj-auth-robustez.md, item 3.1). Sempre criada do
  // zero e destruída ao fim de cada ciclo — nunca fica viva entre ciclos,
  // então normalmente é `null` fora de uma chamada em andamento. O campo
  // existe (em vez de só uma variável local) pra `disconnect()` conseguir
  // fechar ela também se o usuário desconectar no meio de um ciclo.
  private revalidationWindow: BrowserWindow | null = null;
  // Bearer capturado pelo listener onBeforeSendHeaders da janela em uso —
  // campo de instância (não variável local) porque, desde a correção do
  // vazamento de listener (31/07/2026), os listeners só são registrados
  // UMA VEZ, na criação da janela — precisam de um lugar persistente pra
  // gravar o valor a cada nova tentativa de validação.
  private capturedBearer: string | undefined;
  private store: CookieStore;
  private urlPollInterval: NodeJS.Timeout | null = null;
  private queryPool: QueryWindowSlot[] = [];
  private queryWaiters: Array<() => void> = [];
  private autoValidateTimer: NodeJS.Timeout | null = null;
  private ensureApiSessionPromise: Promise<boolean> | null = null;
  private linkedOabCache: { oabNumber: string; oabUf: string } | null = null;
  // Rastreiam falhas seguidas da revalidacao automatica (maybeValidateApi)
  // pra avisar o usuario quando a auto-recuperacao claramente parou de
  // funcionar, em vez de tentar em silencio pra sempre (achado 31/07/2026:
  // 98% das tarefas pdpj_cnj do dia pausaram por sessao expirada sem
  // nenhum aviso visivel ate a fila inteira travar).
  private falhaValidacaoDesdeMs: number | null = null;
  private ultimaNotificacaoFalhaMs: number | null = null;
  // Circuit breaker de falha em capturar o Bearer (item 3.5-b do plano
  // 28) — conta falhas seguidas de tentativas REAIS (janela aberta de
  // verdade), nunca dos atalhos baratos ("sem sessao", "Bearer ja
  // valido"). Zera no primeiro sucesso.
  private falhasValidacaoConsecutivas = 0;
  private validacaoEmCooldownAteMs: number | null = null;
  // Data (YYYY-MM-DD, hora local da máquina) em que a revalidação proativa
  // já rodou — evita disparar mais de uma vez por dia mesmo com o timer de
  // 5min passando várias vezes pela janela-alvo (ver `maybeRunProactiveRevalidation`).
  private proactiveRevalidationDoneOnDate: string | null = null;
  // Rastreiam o alerta de backlog (item 3.6) — separado do rastreio de
  // falha de validação acima, porque os dois podem acontecer sem relação
  // nenhuma um com o outro (sessão saudável + fila travada é o caso real
  // que motivou isso).
  private backlogAltoDesdeMs: number | null = null;
  private ultimaNotificacaoBacklogMs: number | null = null;
  // Achado 06/08/2026, a pedido do Caio: a revalidação automática de
  // segundo plano (`doEnsureApiSession`, timer de 5min) reutiliza o MESMO
  // `authWindow` que um login manual em andamento usa (é a mesma janela em
  // momentos diferentes, por desenho — fica "mantida em segundo plano" após
  // o login pra virar a janela técnica depois). Sem essa trava, o timer de
  // 5min podia cair bem no meio de um login manual em andamento e tentar
  // usar essa mesma janela — competindo com a navegação real do OAuth,
  // provável causa de parte do caos de redirecionamento visto em produção.
  private loginEmAndamento = false;

  constructor(private readonly pairing?: Pairing) {
    this.store = new CookieStore();
  }

  // ============================================================
  //  LOGIN — abre OAuth-like window
  // ============================================================

  /**
   * Abre a janela OAuth-like pra usuário logar no PJe.
   * Retorna a sessão criada.
   */
  async showLoginWindow(): Promise<PublicSession> {
    if (this.authWindow) {
      if (this.authWindow.isDestroyed()) {
        logger.warn('Referencia de janela destruida; limpando estado preso');
        this.authWindow = null;
      } else {
        const existingSession = this.store.getValidSession();
        if (existingSession) {
          logger.info('Sessao valida encontrada com janela persistente; reutilizando contexto autenticado');
          this.authWindow.hide();
          this.authWindow.setSkipTaskbar(true);
          if (!existingSession.accessToken) void this.ensureApiSession();
          return this.toPublicSession(existingSession);
        }
        logger.warn('Janela de login/validacao ja esta aberta; exibindo e focando...');
        recordDiagnosticEvent('pje_login_window_already_open', 'warning', 'Usuario tentou abrir login com janela ja aberta');
        this.authWindow.show();
        this.authWindow.setSkipTaskbar(false);
        this.authWindow.focus();
        this.authWindow.moveTop();
        throw new Error('Janela de login/validacao ja esta aberta e foi exibida novamente');
      }
    }

    const existingSession = this.store.getValidSession();
    if (existingSession) {
      logger.info('Sessao PDPJ valida encontrada; reutilizando sem abrir o Jus.br');
      recordDiagnosticEvent('pdpj_session_reused', 'success', 'Sessao PDPJ existente reutilizada sem novo login', {
        apiValidated: Boolean(existingSession.accessToken),
      });
      if (!existingSession.accessToken) {
        void this.ensureApiSession();
      }
      return this.toPublicSession(existingSession);
    }

    // Trava pro timer de revalidação automática não competir com o login
    // manual em andamento (ver comentário do campo `loginEmAndamento`) —
    // `.finally()` cobre sucesso, erro e qualquer `reject` interno, sem
    // precisar tocar nos pontos internos que chamam resolve/reject.
    this.loginEmAndamento = true;
    const loginPromise = new Promise<PublicSession>((resolve, reject) => {
      const loginStartedAt = Date.now();
      logger.info('========================================');
      logger.info('INICIANDO LOGIN PJe');
      logger.info('========================================');
      logger.info('URL de login (via PDPJ/Jus.br):', PDPJ_LOGIN_URL);
      logger.info('Dominios de cookies: PDPJ/Jus.br e portal publico');
      recordDiagnosticEvent('pje_login_started', 'started', 'Usuario iniciou conexao com PJe', {
        loginUrlHost: new URL(PDPJ_LOGIN_URL).host,
        cookieHosts: Array.from(PDPJ_COOKIE_HOSTS),
      });

      // Flag pra evitar múltiplas capturas
      let loginCompleted = false;
      let sawPdpjAuthRedirect = false;
      let capturedBearerToken: string | undefined;
      let checkingAuthenticatedHome = false;

      const maybeCompleteFromAuthenticatedHome = async (url: string): Promise<void> => {
        if (loginCompleted || sawPdpjAuthRedirect || checkingAuthenticatedHome || !isPdpjReturn(url) || !this.authWindow) return;
        checkingAuthenticatedHome = true;
        try {
          const authenticated = await this.authWindow.webContents.executeJavaScript(`(() => {
            const text = (document.body?.innerText || '').toLowerCase();
            const hasAuthenticatedMenu = /consultar processos|meus favoritos|sair|logout/.test(text);
            const hasLoginPrompt = /entrar|fazer login|login/.test(text);
            return hasAuthenticatedMenu && !hasLoginPrompt;
          })()`, true).catch(() => false);
          if (authenticated && !loginCompleted) {
            logger.info('Home do Jus ja autenticada detectada sem novo redirecionamento; concluindo conexao.');
            recordDiagnosticEvent('pdpj_authenticated_home_detected', 'success', 'Sessao Jus ja autenticada detectada na Home');
            await this.handleLoginSuccess(url, resolve, reject, () => (loginCompleted = true), () => capturedBearerToken);
          }
        } finally {
          checkingAuthenticatedHome = false;
        }
      };

      // Cria BrowserWindow com config otimizada pra mTLS
      this.authWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        title: `${APP_NAME} - Conectar (PDPJ/Jus.br)`,
        icon: loadAppIcon(),
        modal: false,
        resizable: true,
        minimizable: true,
        maximizable: true,
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          // IMPORTANTE: permite mTLS (client cert do Windows)
          // Chromium já suporta nativamente, mas essas flags garantem
          webSecurity: true,
          allowRunningInsecureContent: false,
        },
      });
      recordDiagnosticEvent('pje_login_window_created', 'success', 'Janela de login criada', {
        width: 1000,
        height: 750,
      }, Date.now() - loginStartedAt);

      this.authWindow.setMenuBarVisibility(false);

      // O Portal usa Bearer para as consultas da API. Capturamos somente o
      // token em memoria, sem registrar cabecalhos ou valores em diagnosticos.
      this.authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['https://portaldeservicos.pdpj.jus.br/*'] },
        (details, callback) => {
          const authorization = details.requestHeaders.Authorization || details.requestHeaders.authorization;
          logger.info('PDPJ requisicao enviada', {
            method: details.method,
            url: safeRequestUrlForLog(details.url),
            hasAuthorization: Boolean(authorization),
            headerNames: Object.keys(details.requestHeaders).sort(),
          });
          if (authorization?.startsWith('Bearer ')) {
            capturedBearerToken = authorization.slice(7).trim();
            // Também grava no campo de instância — essa mesma authWindow é
            // reutilizada depois por doEnsureApiSession() (validação em
            // segundo plano), que só reanexa listener próprio quando CRIA
            // a janela, não quando reutiliza uma já existente (fix do
            // vazamento de listener, 31/07/2026). Sem isso, um Bearer
            // capturado logo após o login manual nunca era visto pela
            // validação em segundo plano, que ficava esperando um valor
            // que nunca chegava até estourar o timeout — mesmo com a
            // sessão de verdade já válida.
            this.capturedBearer = capturedBearerToken;
            recordDiagnosticEvent('pdpj_api_request_seen', 'info', 'Requisicao autenticada do Portal PDPJ detectada', { method: details.method });
          }
          callback({ requestHeaders: details.requestHeaders });
        },
      );

      // ============================================================
      //  Listener 1: select-client-certificate
      //  Dispara quando o servidor pede cert. de cliente (mTLS)
      //  Se o popup do Windows não aparecer, esse listener pega
      // ============================================================
      this.authWindow.webContents.on(
        'select-client-certificate',
        (event, url, certificateList, callback) => {
          logger.info('========================================');
          logger.info('SERVIDOR PEDE CERT. DE CLIENTE (mTLS)');
          logger.info('URL:', url);
          logger.info('Certs disponíveis:', certificateList.length);
          logger.info('========================================');
          recordDiagnosticEvent('certificate_requested', 'started', 'PJe/SSO solicitou certificado de cliente', {
            urlHost: safeHost(url),
            certificatesAvailable: certificateList.length,
            subjects: certificateList.slice(0, 5).map((certificate) => certificate.subjectName),
            issuers: certificateList.slice(0, 5).map((certificate) => certificate.issuerName),
          });

          event.preventDefault();

          if (certificateList.length === 0) {
            logger.warn('Nenhum cert. disponível no Windows Cert Store!');
            logger.warn('Para A1: instale o .pfx no Windows');
            logger.warn('Para A3: conecte o token e verifique o middleware');
            recordDiagnosticEvent('certificate_selection_failed', 'error', 'Nenhum certificado disponivel para o Chromium', {
              urlHost: safeHost(url),
            });
            (callback as any)(); // cancela (Electron pode passar callback opcional)
            this.showCertNotFoundError();
            return;
          }

          if (certificateList.length === 1) {
            // Só 1 cert: auto-seleciona (não mostra popup do Chromium)
            logger.info('1 cert. encontrado, auto-selecionando:', certificateList[0].subjectName);
            recordDiagnosticEvent('certificate_auto_selected', 'success', 'Um certificado encontrado e selecionado automaticamente', {
              subject: certificateList[0].subjectName,
              issuer: certificateList[0].issuerName,
            });
            callback(certificateList[0]);
            return;
          }

          // Múltiplos certs: deixa Chromium mostrar popup de seleção
          logger.info(`${certificateList.length} certs encontrados, mostrando popup de seleção`);
          recordDiagnosticEvent('certificate_auto_selected', 'warning', 'Multiplos certificados encontrados; primeiro certificado selecionado pelo CS', {
            certificatesAvailable: certificateList.length,
            selectedSubject: certificateList[0].subjectName,
            selectedIssuer: certificateList[0].issuerName,
          });
          callback(certificateList[0]); // seleciona o primeiro por padrão
        }
      );

      // ============================================================
      //  Listener 2: certificate-error
      //  Não trava se tiver erro de cert (deixa usuário tentar de novo)
      // ============================================================
      this.authWindow.webContents.on(
        'certificate-error',
        (event, url, error, certificate, callback) => {
          logger.warn('========================================');
          logger.warn('ERRO DE CERTIFICADO TLS');
          logger.warn('URL:', url);
          logger.warn('Erro:', error);
          logger.warn('Cert subject:', certificate.subjectName);
          logger.warn('Cert issuer:', certificate.issuerName);
          logger.warn('========================================');
          recordDiagnosticEvent('tls_certificate_error', 'error', error, {
            urlHost: safeHost(url),
            subject: certificate.subjectName,
            issuer: certificate.issuerName,
          });

          // Não bloqueia o load (deixa usuário ver o erro visualmente)
          // event.preventDefault() seria pra BLOQUEAR
          callback(false);
        }
      );

      // ============================================================
      //  Listener 3: did-fail-load
      //  Detecta erros de rede / TLS / cancelamento
      // ============================================================
      this.authWindow.webContents.on(
        'did-fail-load',
        (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
          logger.error('========================================');
          logger.error('FALHA AO CARREGAR PJe');
          logger.error('Error code:', errorCode);
          logger.error('Error description:', errorDescription);
          logger.error('URL:', validatedURL);
          logger.error('Is main frame:', isMainFrame);
          logger.error('========================================');
          recordDiagnosticEvent('pje_page_load_failed', 'error', errorDescription, {
            errorCode,
            urlHost: safeHost(validatedURL),
            isMainFrame,
          });

          if (!isMainFrame) return; // ignora sub-frames

          // Códigos de erro comuns do Chromium
          // -2: ERR_FAILED (genérico)
          // -3: ERR_ABORTED
          // -6: ERR_FILE_NOT_FOUND
          // -100: ERR_CONNECTION_CLOSED
          // -101: ERR_CONNECTION_RESET
          // -102: ERR_CONNECTION_REFUSED
          // -105: ERR_NAME_NOT_RESOLVED
          // -106: ERR_INTERNET_DISCONNECTED
          // -107: ERR_SSL_PROTOCOL_ERROR
          // -108: ERR_ADDRESS_INVALID
          // -109: ERR_ADDRESS_UNREACHABLE
          // -110: ERR_CONNECTION_TIMEOUT
          // -111: ERR_CONNECTION_FAILED
          // -112: ERR_HOST_UNREACHABLE
          // -113: ERR_NO_ACCESS
          // -200: ERR_CERT_COMMON_NAME_INVALID
          // -201: ERR_CERT_DATE_INVALID
          // -202: ERR_CERT_AUTHORITY_INVALID
          // -203: ERR_CERT_CONTAINS_ERRORS
          // -204: ERR_CERT_NO_REVOCATION_MECHANISM
          // -205: ERR_CERT_UNABLE_TO_CHECK_REVOCATION
          // -206: ERR_CERT_REVOKED
          // -207: ERR_CERT_INVALID
          // -208: ERR_CERT_NAME_CONSTRAINT_VIOLATION
          // -209: ERR_CERT_WEAK_SIGNATURE_ALGORITHM
          // -210: ERR_CERT_NON_AUTHORITATIVE
          // -211: ERR_CERT_INVALID_PURPOSE
          // -300: ERR_CERT_VALIDITY_TOO_LONG
          // -501: ERR_BAD_SSL_CLIENT_AUTH_CERT ← IMPORTANTE: cert. A1 não foi enviado/rejeitado

          if (errorCode === -501) {
            this.showCertRejectedError();
          } else if (errorCode === -106 || errorCode === -105) {
            this.showNetworkError();
          } else if (errorCode === -2 || errorCode === -107) {
            this.showGenericLoadError(errorDescription);
          }
          // Não fecha a janela — deixa usuário ver o erro e tentar de novo
        }
      );

      // ============================================================
      //  Listener 4: did-navigate
      //  Pega navegação real (não pushState do Angular)
      // ============================================================
      this.authWindow.webContents.on('did-navigate', async (event, url) => {
        logger.debug('did-navigate:', url);
        if (isPdpjAuthHost(url)) sawPdpjAuthRedirect = true;
        if (sawPdpjAuthRedirect && isPdpjReturn(url) && !loginCompleted) {
          await this.handleLoginSuccess(url, resolve, reject, () => (loginCompleted = true), () => capturedBearerToken);
        } else {
          await maybeCompleteFromAuthenticatedHome(url);
        }
      });

      // ============================================================
      //  Listener 5: did-navigate-in-page
      //  Pega pushState do Angular (History API)
      // ============================================================
      this.authWindow.webContents.on('did-navigate-in-page', async (event, url) => {
        logger.debug('did-navigate-in-page:', url);
        if (isPdpjAuthHost(url)) sawPdpjAuthRedirect = true;
        if (sawPdpjAuthRedirect && isPdpjReturn(url) && !loginCompleted) {
          await this.handleLoginSuccess(url, resolve, reject, () => (loginCompleted = true), () => capturedBearerToken);
        } else {
          await maybeCompleteFromAuthenticatedHome(url);
        }
      });

      // ============================================================
      //  Polling de URL a cada 1s (fallback pra qualquer caso)
      // ============================================================
      this.urlPollInterval = setInterval(() => {
        if (loginCompleted || !this.authWindow) return;
        try {
          const url = this.authWindow.webContents.getURL();
          if (isPdpjAuthHost(url)) sawPdpjAuthRedirect = true;
          if (sawPdpjAuthRedirect && isPdpjReturn(url)) {
            logger.debug('Polling detectou login:', url);
            this.handleLoginSuccess(url, resolve, reject, () => (loginCompleted = true), () => capturedBearerToken);
          } else {
            void maybeCompleteFromAuthenticatedHome(url);
          }
        } catch (_err) {
          // ignora
        }
      }, URL_POLL_INTERVAL_MS);

      // Carrega URL inicial (jus.br — PDPJ cuida do redirecionamento até o PJe)
      logger.info('Carregando jus.br (PDPJ)...');
      this.authWindow
        .loadURL(PDPJ_LOGIN_URL)
        .then(() => {
          logger.info('jus.br carregado com sucesso');
          recordDiagnosticEvent('pje_login_url_loaded', 'success', 'URL inicial do jus.br/PDPJ carregada', {
            urlHost: safeHost(PDPJ_LOGIN_URL),
          });
        })
        .catch((err) => {
          logger.error('Erro ao carregar jus.br:', err);
          recordDiagnosticEvent('pje_login_url_load_failed', 'error', err.message, {
            urlHost: safeHost(PDPJ_LOGIN_URL),
          });
        });

      // ============================================================
      //  Timeout de segurança
      // ============================================================
      const timeoutId = setTimeout(() => {
        if (!loginCompleted) {
          logger.error('========================================');
          logger.error('TIMEOUT NO LOGIN PDPJ (10min)');
          logger.error('Possíveis causas:');
          logger.error('  1. Usuário demorou pra logar');
          logger.error('  2. Popup do cert. A1 foi cancelado');
          logger.error('  3. PDPJ/Jus.br está lento/offline');
          logger.error('========================================');
          recordDiagnosticEvent('pje_login_timeout', 'error', 'Tempo limite de login excedido', {
            durationMs: TIMEOUTS.login,
          });
          this.cleanup();
          if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.close();
          this.authWindow = null;
          reject(
            new Error(
              'Tempo limite de login no PDPJ excedido (10min). ' +
                'Conclua o login no Jus.br e, se solicitado, selecione o cert. A1.'
            )
          );
        }
      }, TIMEOUTS.login);

      // ============================================================
      //  Cleanup quando janela fecha
      // ============================================================
      this.authWindow.on('closed', () => {
        clearTimeout(timeoutId);
        if (this.urlPollInterval) {
          clearInterval(this.urlPollInterval);
          this.urlPollInterval = null;
        }
        this.authWindow = null;
        if (!loginCompleted) {
          logger.warn('Janela fechada antes do login completar');
          recordDiagnosticEvent('pje_login_window_closed_before_success', 'warning', 'Janela fechada antes do login completar');
          if (!this.store.hasValidSession()) {
            reject(new Error('Login cancelado (janela foi fechada)'));
          }
        }
      });
    });
    return loginPromise.finally(() => { this.loginEmAndamento = false; });
  }

  // ============================================================
  //  HANDLER DE SUCESSO
  // ============================================================

  /**
   * Chamado quando detectou que login completou (via did-navigate, polling, etc).
   */
  private async handleLoginSuccess(
    url: string,
    resolve: (value: PublicSession) => void,
    reject: (reason?: any) => void,
    markCompleted: () => void,
    getBearerToken: () => string | undefined,
  ): Promise<void> {
    if (this.urlPollInterval) {
      clearInterval(this.urlPollInterval);
      this.urlPollInterval = null;
    }
    markCompleted();

    logger.info('========================================');
    logger.info('LOGIN PDPJ DETECTADO!');
    logger.info('URL:', url);
    logger.info('========================================');
    recordDiagnosticEvent('pdpj_login_detected', 'success', 'Retorno autenticado do PDPJ detectado', {
      urlHost: safeHost(url),
    });

    try {
      // Depois do retorno autenticado, qualquer navegaÃ§Ã£o do Portal serve
      // apenas para captura tÃ©cnica e nÃ£o deve ficar visÃ­vel ao usuÃ¡rio.
      this.authWindow?.hide();
      this.authWindow?.setSkipTaskbar(true);
      if (!this.authWindow) throw new Error('Janela de login não está aberta');
      const session = await this.captureSession(this.authWindow, getBearerToken());
      logger.info('Sessão capturada com sucesso, fechando janela...');
      recordDiagnosticEvent('pdpj_session_captured', 'success', 'Sessao PDPJ capturada com sucesso', {
        userId: session.userId,
        cookiesCount: session.cookies.length,
        expiresAt: session.expiresAt,
      });
      this.cleanup();
      this.authWindow?.hide();
      this.authWindow?.setSkipTaskbar(true);
      resolve(this.toPublicSession(session));
      // Deixa o Electron concluir o fechamento da janela e o CookieStore
      // persistir a sessÃ£o antes de iniciar a captura tÃ©cnica do Bearer.
      setTimeout(() => void this.ensureApiSession(), 250);
    } catch (err: any) {
      logger.error('Erro ao capturar sessão:', err);
      recordDiagnosticEvent('pje_session_capture_failed', 'error', err.message, {
        urlHost: safeHost(url),
      });
      this.cleanup();
      this.authWindow?.close();
      this.authWindow = null;
      logger.warn('Janela PDPJ fechada apos falha de validacao automatica da API.');
      reject(err);
    }
  }

  /**
   * OAB vinculada ao escritório pareado — usada só pra ter algo real e
   * genérico (funciona pra qualquer tenant) pra digitar na busca que
   * dispara a primeira chamada autenticada (ver `ensurePortalBearer`).
   * Cache em memória: a lista de OABs do escritório não muda com
   * frequência, não precisa bater na rede toda vez.
   */
  private async getLinkedOab(): Promise<{ oabNumber: string; oabUf: string } | null> {
    if (this.linkedOabCache) return this.linkedOabCache;
    const token = this.pairing?.getDeviceToken();
    if (!token) return null;
    try {
      const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/oabs`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) return null;
      const data = await response.json() as { oabs?: Array<{ oab_number?: string; oab_uf?: string }> };
      const first = data.oabs?.find((oab) => oab.oab_number && oab.oab_uf);
      if (!first?.oab_number || !first.oab_uf) return null;
      this.linkedOabCache = { oabNumber: first.oab_number.replace(/\D/g, ''), oabUf: first.oab_uf.toUpperCase() };
      return this.linkedOabCache;
    } catch (error: any) {
      logger.warn('PDPJ: falha ao buscar OAB vinculada pro gatilho de validacao', error?.message || error);
      return null;
    }
  }

  /**
   * Destrava na fila as tarefas que ficaram paradas em
   * `paused_login_required` — sem isso, `POST /api/cs/tasks/claim` nunca
   * mais escolhe elas de novo (só considera `pending` ou lease expirado),
   * mesmo com o login/API já revalidados. Chamado assim que o Bearer é
   * recapturado com sucesso (ver docs/roadmap/22-extracao-pdpj-e-fila-cs.md).
   */
  private async resumePausedTasks(): Promise<void> {
    const token = this.pairing?.getDeviceToken();
    if (!token) return;
    try {
      const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/tasks/resume`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        logger.warn('PDPJ: falha ao destravar tarefas pausadas', { status: response.status });
        return;
      }
      const data = await response.json() as { resumed?: number };
      if (data.resumed) logger.info(`PDPJ: ${data.resumed} tarefa(s) pausada(s) destravada(s) apos revalidar a API`);
    } catch (error: any) {
      logger.warn('PDPJ: erro ao destravar tarefas pausadas', error?.message || error);
    }
  }

  /**
   * O retorno do login Jus.br pode acontecer antes de o Portal PDPJ fazer a
   * primeira chamada da API. Abrimos o Portal automaticamente, aguardamos a
   * requisicao autenticada e mantemos o Bearer somente no processo principal.
   */
  private async ensurePortalBearer(window: BrowserWindow, getBearerToken: () => string | undefined): Promise<string> {
    const existing = getBearerToken();
    if (existing) return existing;
    if (!window) throw new Error('Janela PDPJ nao esta disponivel para validar a API.');

    recordDiagnosticEvent('pdpj_api_validation_started', 'started', 'Validando sessao da API PDPJ apos o login');
    if (SHOW_PDPJ_VALIDATION_WINDOW) {
      window.show();
      window.setSkipTaskbar(false);
      window.focus();
      window.moveTop();
    } else {
      window.hide();
      window.setSkipTaskbar(true);
    }
    try {
      // O Portal direto pode abrir sem a sessao da API. O fluxo que gera o
      // contexto correto passa pelo Jus autenticado e aciona Consultar processos.
      await window.loadURL(PDPJ_LOGIN_URL);
      logger.info('Jus autenticado carregado na janela tecnica; procurando Consultar processos');
    } catch (error: any) {
      recordDiagnosticEvent('pdpj_api_validation_load_failed', 'warning', error.message, { urlHost: safeHost(PDPJ_LOGIN_URL) });
    }

    // Fecha modal "Navegação Guiada" se apareceu durante o carregamento
    await this.dismissGuidedNavigationModal(window);

    const startedAt = Date.now();
    let lastDiagnosticoAt = 0;
    let domInspected = false;
    let consultationTriggered = false;
    // Achado em produção (31/07/2026): a janela reutilizada às vezes fica
    // presa fora da area autenticada do Portal (SSO silencioso do Keycloak
    // que nunca completa o redirecionamento de volta, ou a home publica do
    // jus.br) — o resto do loop então tenta clicar em campos de busca que
    // não existem nessa página, gastando os 45s inteiros sem chance
    // nenhuma de capturar o Bearer.
    //
    // Detecção (revisada 31/07/2026, apos o 1o reload-por-regex-de-URL
    // isolado pegar só 12 dos 335 casos reais do dia): agora combina dois
    // sinais de pagina (link "Consultar processos" E o combobox de busca,
    // os dois marcadores esperados da area autenticada — nenhum dos dois
    // presente = "nao parece autenticado") e só age depois de 2 checagens
    // SEGUIDAS (10s de intervalo) concordando, pra nao recarregar no meio
    // de uma transicao normal que so ainda nao terminou de carregar. Até
    // MAX_RELOADS_TENTATIVA tentativas por captura (antes era só 1).
    let sinalNaoAutenticadoSeguido = 0;
    let reloadsFeitos = 0;
    const MAX_RELOADS_TENTATIVA = 2;
    while (Date.now() - startedAt < BEARER_CAPTURE_TIMEOUT_MS) {
      const token = getBearerToken();
      if (token) {
        recordDiagnosticEvent('pdpj_api_validated', 'success', 'Bearer da API PDPJ capturado');
        return token;
      }
      if (Date.now() - lastDiagnosticoAt > 10_000) {
        lastDiagnosticoAt = Date.now();
        const diag = await this.diagnosticarPagina(window);
        logger.info('PDPJ: diagnostico da pagina tecnica', diag);
        const pareceNaoAutenticado = !diag || (!diag.temLinkConsultarProcessos && !diag.temComboboxBusca);
        sinalNaoAutenticadoSeguido = pareceNaoAutenticado ? sinalNaoAutenticadoSeguido + 1 : 0;

        if (sinalNaoAutenticadoSeguido >= 2 && reloadsFeitos < MAX_RELOADS_TENTATIVA && !window.webContents.isLoading()) {
          reloadsFeitos += 1;
          sinalNaoAutenticadoSeguido = 0;
          logger.warn(`PDPJ: pagina parece fora da area autenticada em 2 checagens seguidas, recarregando (tentativa ${reloadsFeitos}/${MAX_RELOADS_TENTATIVA})`, diag);
          recordDiagnosticEvent('pdpj_api_validation_stuck_reload', 'warning', 'Pagina tecnica parece travada fora da area autenticada; recarregando', { ...diag, tentativa: reloadsFeitos });
          try {
            await window.loadURL(PDPJ_LOGIN_URL);
          } catch (error: any) {
            logger.warn('PDPJ: falha ao recarregar apos deteccao de pagina nao autenticada:', error?.message || error);
          }
          // A pagina mudou de verdade — os passos de clicar em "Consultar
          // processos" e inspecionar o formulario precisam rodar de novo.
          consultationTriggered = false;
          domInspected = false;
          await new Promise((resolve) => setTimeout(resolve, BEARER_CAPTURE_RETRY_MS));
          continue;
        }
      }
      // Busca uma vez, alguns segundos depois do clique em "Consultar
      // processos", pra dar tempo da pagina renderizar o formulario.
      // Prioriza buscar pela OAB vinculada ao escritorio (generico, funciona
      // pra qualquer tenant); se nao tiver OAB vinculada ou a interacao com
      // o seletor falhar por qualquer motivo, cai pro CNJ generico de
      // fallback — nunca fica sem tentar nada (achado em log real,
      // 29/07/2026: o seletor de tipo de busca e um mat-select com opcoes
      // "Número do Processo"/"CPF da Parte"/"CNPJ da Parte"/"OAB"/"STF...").
      if (!domInspected && consultationTriggered && Date.now() - startedAt > 5000) {
        domInspected = true;
        const linkedOab = await this.getLinkedOab();
        const searchResult = await window.webContents.executeJavaScript(`(async () => {
          const oab = ${JSON.stringify(linkedOab)};
          // Espera o elemento aparecer em vez de checar uma vez só — achado
          // 14/08/2026: o Angular às vezes ainda não terminou de renderizar
          // no instante exato em que o código olhava (visto ao vivo: 293ms
          // depois de uma navegação), fazendo o código concluir "não achei"
          // quando o elemento só ainda não tinha aparecido. Ver
          // docs/roadmap/28-pdpj-auth-robustez.md, item 3.2.
          const waitFor = async (encontra, timeoutMs, intervaloMs) => {
            const limite = Date.now() + (timeoutMs || 5000);
            while (Date.now() < limite) {
              const achado = encontra();
              if (achado) return achado;
              await new Promise((r) => setTimeout(r, intervaloMs || 200));
            }
            return null;
          };
          const dumpInputs = () => Array.from(document.querySelectorAll('input,textarea'))
            .map((el) => ({ tag: el.tagName, type: el.type || null, name: el.name || null, id: el.id || null, placeholder: el.placeholder || null }));
          const setNativeValue = (el, value) => {
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          };
          const clickBuscar = async () => {
            const searchButton = await waitFor(() => Array.from(document.querySelectorAll('button')).find((b) => {
              const text = (b.textContent || '').toLowerCase();
              return text.includes('buscar') && !text.includes('limpar');
            }));
            if (!searchButton) return false;
            searchButton.click();
            return true;
          };

          // Tenta a busca por OAB primeiro (generica, funciona pra qualquer
          // tenant). Qualquer etapa que falhar so registra o motivo e cai
          // pro fallback de CNJ abaixo — nunca retorna sem tentar o
          // fallback tambem (achado em log real, 29/07/2026: a 1a versao
          // desistia se um passo da OAB falhasse, sem tentar o CNJ).
          let oabFalhaMotivo = null;
          let inputsAposSelecionarOab = null;
          if (oab) {
            try {
              const trigger = await waitFor(() => document.querySelector('[role="combobox"],mat-select'));
              if (!trigger) {
                oabFalhaMotivo = 'combobox-nao-encontrado';
              } else {
                trigger.click();
                const oabOption = await waitFor(() => Array.from(document.querySelectorAll('.cdk-overlay-container [role="option"], .cdk-overlay-container mat-option'))
                  .find((el) => (el.textContent || '').trim().toLowerCase() === 'oab'), 3000);
                if (!oabOption) {
                  oabFalhaMotivo = 'opcao-oab-nao-encontrada';
                } else {
                  oabOption.click();
                  const input = await waitFor(() => document.querySelector('input:not([type="hidden"])'), 3000);
                  inputsAposSelecionarOab = dumpInputs();
                  if (!input) {
                    oabFalhaMotivo = 'campo-nao-encontrado-apos-selecionar-oab';
                  } else {
                    setNativeValue(input, oab.oabUf + oab.oabNumber);
                    if (await clickBuscar()) return { ok: true, modo: 'oab', inputsAposSelecionarOab };
                    oabFalhaMotivo = 'botao-buscar-nao-encontrado-oab';
                  }
                }
              }
            } catch (e) {
              oabFalhaMotivo = String(e && e.message || e);
            }
          }

          // Fallback: sem OAB vinculada, ou a busca por OAB falhou em
          // alguma etapa (motivo registrado em oabFalhaMotivo).
          try {
            const input = await waitFor(() => document.querySelector('input[name="numeroProcesso"]') || document.querySelector('input:not([type="hidden"])'), 3000);
            if (!input) return { ok: false, reason: 'nenhum-campo-encontrado', oabFalhaMotivo, inputsAposSelecionarOab };
            setNativeValue(input, ${JSON.stringify(BEARER_PRIME_CNJ_FALLBACK)});
            if (await clickBuscar()) return { ok: true, modo: 'cnj-fallback', oabFalhaMotivo, inputsAposSelecionarOab };
            return { ok: false, reason: 'botao-buscar-nao-encontrado-fallback', oabFalhaMotivo, inputsAposSelecionarOab };
          } catch (e) {
            return { ok: false, reason: String(e && e.message || e), oabFalhaMotivo, inputsAposSelecionarOab };
          }
        })()`, true).catch((error: any) => ({ ok: false, reason: error?.message || String(error) }));
        logger.info('PDPJ: tentativa de busca automatica pra disparar chamada autenticada', { ...searchResult, oabDisponivel: Boolean(linkedOab) });
      }
      if (!consultationTriggered) {
        consultationTriggered = true;
        const action = await window.webContents.executeJavaScript(`(async () => {
          const selectors = 'a,button,[role="button"],[role="link"]';
          const encontra = () => Array.from(document.querySelectorAll(selectors))
            .find((element) => (element.textContent || '').toLowerCase().replace(/\\s+/g, ' ').includes('consultar processos'));
          const limite = Date.now() + 5000;
          let item = encontra();
          while (!item && Date.now() < limite) {
            await new Promise((r) => setTimeout(r, 200));
            item = encontra();
          }
          if (!(item instanceof HTMLElement)) return null;
          if (item instanceof HTMLAnchorElement && item.href) return item.href;
          item.click();
          return 'clicked';
        })()`, true).catch(() => false);
        if (typeof action === 'string' && action.startsWith('https://')) {
          logger.info('Destino de Consultar processos encontrado; navegando na janela tecnica:', safeHost(action));
          await window.loadURL(action).catch((error: any) => {
            logger.warn('Falha ao navegar para Consultar processos:', error.message);
          });
        } else if (action === 'clicked') {
          logger.info('Consultar processos acionado na janela tecnica do Jus');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, BEARER_CAPTURE_RETRY_MS));
    }

    // Diagnostico final rico (31/07/2026) — antes só logava a mensagem
    // genérica, sem estado nenhum da pagina no momento em que desistiu.
    // Isso obrigava a proxima investigacao a adivinhar de novo em que
    // etapa travou. Agora captura URL/titulo/marcadores da pagina e quantos
    // cookies do PDPJ realmente estao na janela nesse instante (descarta a
    // hipotese de "cookie nao foi aplicado" se o numero bater com o
    // esperado).
    const diagFinal = await this.diagnosticarPagina(window);
    const cookiesPdpjNaJanela = await electronSession.defaultSession.cookies
      .get({})
      .then((cookies) => cookies.filter((c) => PDPJ_COOKIE_HOSTS.has((c.domain || '').replace(/^\./, ''))).length)
      .catch(() => -1);
    const contextoFalha = { ...diagFinal, cookiesPdpjNaJanela, reloadsFeitos };
    logger.error('PDPJ: validacao da API expirou sem capturar Bearer — diagnostico final', contextoFalha);
    recordDiagnosticEvent('pdpj_api_validation_failed', 'error', 'Portal carregado, mas nao houve requisicao PDPJ com Bearer', contextoFalha);
    throw new Error('Login concluido, mas a sessao da API PDPJ nao foi validada. Tente conectar novamente.');
  }

  /**
   * Snapshot do estado da pagina tecnica no momento da checagem — usado
   * tanto pra decidir se ela "parece autenticada" (ver loop acima) quanto
   * pro diagnostico final de falha. Só nomes de chave de storage, nunca
   * valor (pode conter token/dado sensivel).
   */
  private async diagnosticarPagina(window: BrowserWindow): Promise<{
    url: string;
    title: string;
    readyState: string;
    temLinkConsultarProcessos: boolean;
    temComboboxBusca: boolean;
    temLinkLogin: boolean;
    storage: { session: string[]; local: string[] } | { error: string };
  } | null> {
    if (!window || window.isDestroyed()) return null;
    return window.webContents.executeJavaScript(`(() => {
      try {
        const texto = (el) => (el.textContent || '').toLowerCase().replace(/\\s+/g, ' ');
        const temLinkConsultarProcessos = Array.from(document.querySelectorAll('a,button,[role="button"],[role="link"]'))
          .some((el) => texto(el).includes('consultar processos'));
        const temComboboxBusca = Boolean(document.querySelector('[role="combobox"],mat-select'));
        const temLinkLogin = Array.from(document.querySelectorAll('a,button'))
          .some((el) => { const t = texto(el); return t.includes('entrar') || t.includes('login'); });
        let storage;
        try {
          storage = { session: Object.keys(window.sessionStorage || {}), local: Object.keys(window.localStorage || {}) };
        } catch (e) {
          storage = { error: String(e && e.message || e) };
        }
        return { url: location.href, title: document.title, readyState: document.readyState, temLinkConsultarProcessos, temComboboxBusca, temLinkLogin, storage };
      } catch (e) {
        return { url: location.href, title: '', readyState: document.readyState, temLinkConsultarProcessos: false, temComboboxBusca: false, temLinkLogin: false, storage: { error: String(e && e.message || e) } };
      }
    })()`, true).catch((error: any) => ({
      url: '', title: '', readyState: 'erro', temLinkConsultarProcessos: false, temComboboxBusca: false, temLinkLogin: false,
      storage: { error: error?.message || String(error) },
    }));
  }

  // ============================================================
  //  CAPTURA DE SESSÃO
  // ============================================================

  /**
   * Extrai cookies da BrowserWindow e monta PdpjSession.
   */
  private async captureSession(window: BrowserWindow, accessToken?: string, preserveCreatedAt?: Date): Promise<PdpjSession> {
    if (!window) {
      throw new Error('Janela de login não está aberta');
    }

    logger.info(`Aguardando ${COOKIE_WAIT_MS}ms pro Angular setar cookies HttpOnly...`);
    await new Promise((r) => setTimeout(r, COOKIE_WAIT_MS));

    const cookies = await this.waitForPdpjCookies();

    logger.info('========================================');
    logger.info('COOKIES CAPTURADOS');
    logger.info('Total:', cookies.length);
    logger.info('Nomes:', cookies.map((c) => c.name).join(', '));
    logger.info('========================================');
    recordDiagnosticEvent('pje_cookies_collected', 'info', 'Cookies do PJe coletados apos login', {
      count: cookies.length,
      cookieNames: cookies.map((c) => c.name),
      hasXsrf: cookies.some((c) => c.name === 'XSRF-TOKEN'),
      hasSession: cookies.some((c) => c.name === 'JSESSIONID' || c.name === 'AUTH_SESSION_ID'),
    });

    if (!accessToken && cookies.length === 0) {
      logger.error('XSRF-TOKEN não encontrado nos cookies');
      logger.error('Isso indica que o login não completou corretamente');
      logger.error('Possíveis causas:');
      logger.error('  1. Cert. A1 foi rejeitado pelo PJe');
      logger.error('  2. PJe não criou sessão (erro interno)');
      logger.error('  3. Cookie foi setado com domínio diferente');
      recordDiagnosticEvent('pdpj_session_missing', 'error', 'Sessao PDPJ nao retornou dados apos login', {
        cookieNames: cookies.map((c) => c.name),
      });
      throw new Error(
        'Cookie XSRF-TOKEN não encontrado — login não completou. ' +
          'Verifique se você selecionou o cert. correto no popup do Windows.'
      );
    }

    // Pega o JSESSIONID
    const sessionCookie = cookies.find(
      (c) => c.name === 'JSESSIONID' || c.name === 'AUTH_SESSION_ID' || c.name === 'KEYCLOAK_SESSION'
    );
    if (!sessionCookie) {
      logger.warn('JSESSIONID não encontrado, tentando AUTH_SESSION_ID/KEYCLOAK_SESSION');
    }

    // Extrai userId do painel
    const userId = 0;
    logger.info('userId extraído:', userId);

    const session: PdpjSession = {
      userId,
      cookies: cookies.map(this.serializeCookie),
      csrfToken: '',
      expiresAt: this.estimateExpiry(cookies),
      createdAt: preserveCreatedAt ?? new Date(),
      lastUsedAt: new Date(),
      provider: 'pdpj',
      accessToken,
      tokenType: 'Bearer',
      tokenExpiresAt: accessToken ? (decodeJwtExpiry(accessToken) ?? new Date(Date.now() + TOKEN_FALLBACK_TTL_MS)) : undefined,
      apiValidated: Boolean(accessToken),
    };

    this.store.saveSession(session);
    logger.info('========================================');
    logger.info('SESSÃO PJe SALVA COM SUCESSO');
    logger.info('userId:', userId);
    logger.info('Cookies:', session.cookies.length);
    logger.info('Expira em:', session.expiresAt.toISOString());
    logger.info('========================================');

    return session;
  }

  /**
   * Aguarda os cookies reais do PJe. O Chromium pode gravar o cookie com ou
   * sem o ponto inicial no dominio (ex.: `.jus.br` ou `jus.br`), entao
   * consultamos por URL, por dominio e tambem filtramos a lista completa da
   * sessao.
   */
  private async waitForPdpjCookies(): Promise<Electron.Cookie[]> {
    const startedAt = Date.now();
    let lastCookies: Electron.Cookie[] = [];

    while (Date.now() - startedAt < COOKIE_CAPTURE_TIMEOUT_MS) {
      lastCookies = await this.getPdpjCookies();
      const names = lastCookies.map((c) => c.name).join(', ');
      logger.info(`Tentativa de captura de cookies: ${lastCookies.length} cookies (${names || 'nenhum'})`);

      if (lastCookies.length > 0) {
        return lastCookies;
      }

      await new Promise((r) => setTimeout(r, COOKIE_CAPTURE_RETRY_MS));
    }

    return lastCookies;
  }

  private async getPdpjCookies(): Promise<Electron.Cookie[]> {
    // Cookies vivem na sessão do Electron (`electronSession.defaultSession`),
    // não numa janela específica — nenhuma BrowserWindow deste app usa
    // `partition` própria, então qualquer janela veria os mesmos cookies.
    // Ler direto da sessão (em vez de exigir uma janela de login aberta)
    // deixa essa função utilizável também pela janela de revalidação, que
    // agora é uma instância separada (ver `revalidationWindow`).
    const allCookies = await electronSession.defaultSession.cookies.get({});
    const pdpjCookies = allCookies.filter((cookie) => {
      const domain = (cookie.domain || '').replace(/^\./, '');
      return Array.from(PDPJ_COOKIE_HOSTS).some((host) => domain === host || domain.endsWith(`.${host}`));
    });

    return this.mergeCookies(pdpjCookies);
  }

  private mergeCookies(cookies: Electron.Cookie[]): Electron.Cookie[] {
    const map = new Map<string, Electron.Cookie>();
    for (const cookie of cookies) {
      map.set(`${cookie.name}|${cookie.domain}|${cookie.path}`, cookie);
    }
    return Array.from(map.values());
  }

  /**
   * Estima expiração real da sessão a partir da data de expiração que o
   * próprio PDPJ/Keycloak colocou nos cookies — em vez do palpite fixo de
   * `SESSION_COOKIES_TTL_MS` (7 dias, nunca confirmado contra a validade
   * real). Usa a mais próxima entre os cookies capturados: se qualquer um
   * deles expirar, a sessão já não é mais utilizável, então o limite
   * verdadeiro é o menor prazo entre eles, não o maior.
   *
   * Função existia sem nunca ser chamada (achado 31/07/2026, ao investigar
   * por que a tela mostrava "expira em Xd" com a sessão já morta de
   * verdade) — só media 1 cookie (XSRF-TOKEN); generalizada pra olhar
   * todos os cookies da sessão.
   */
  private estimateExpiry(cookies: Electron.Cookie[]): Date {
    const comExpiracao = cookies.filter((c) => c.expirationDate);
    if (comExpiracao.length === 0) return new Date(Date.now() + SESSION_COOKIES_TTL_MS);
    const maisProxima = Math.min(...comExpiracao.map((c) => c.expirationDate! * 1000));
    return new Date(maisProxima);
  }

  /**
   * Serializa um Cookie do Electron pro nosso formato.
   */
  private serializeCookie = (c: Electron.Cookie): SerializedCookie => ({
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    secure: c.secure ?? false,
    httpOnly: c.httpOnly ?? false,
    sameSite: c.sameSite as 'Strict' | 'Lax' | 'None' | undefined,
    expirationDate: c.expirationDate,
  });

  // ============================================================
  //  TRATAMENTO DE ERROS ESPECÍFICOS
  // ============================================================

  private showCertNotFoundError(): void {
    logger.error('========================================');
    logger.error('CERTIFICADO NÃO ENCONTRADO NO WINDOWS');
    logger.error('========================================');
    logger.error('O usuário precisa:');
    logger.error('');
    logger.error('Para cert. A1 (.pfx):');
    logger.error('  1. Clique 2x no arquivo .pfx');
    logger.error('  2. "Instalar certificado" → "Pessoal"');
    logger.error('  3. Digite a senha do cert.');
    logger.error('  4. MARQUE "Marcar como exportável"');
    logger.error('');
    logger.error('Para cert. A3 (token/smart card):');
    logger.error('  1. Conecte o token no USB');
    logger.error('  2. Instale o middleware (SafeSign/SafeID) se ainda não instalou');
    logger.error('  3. Abra o gerenciador do token e verifique se o cert. aparece');
    logger.error('  4. Teste em: Certificados → Pessoal → verificar se o cert. A3 está lá');
    logger.error('');
    logger.error('Verificar em certmgr.msc → Pessoal → Certificados');
    logger.error('========================================');
  }

  private showCertRejectedError(): void {
    logger.error('========================================');
    logger.error('CERTIFICADO REJEITADO PELO PJe');
    logger.error('Código de erro: -501 (ERR_BAD_SSL_CLIENT_AUTH_CERT)');
    logger.error('========================================');
    logger.error('Possíveis causas:');
    logger.error('  1. Cert. expirado (verificar data de validade)');
    logger.error('  2. Cert. revogado pela AC');
    logger.error('  3. PJe não confia na AC que emitiu o cert.');
    logger.error('  4. Popup do cert. foi cancelado pelo usuário');
    logger.error('  5. PIN do token não foi digitado ou incorreto');
    logger.error('');
    logger.error('Para cert. A3 (token):');
    logger.error('  - Verifique se o token está conecto');
    logger.error('  - Abra o gerenciador do token e digite o PIN');
    logger.error('  - Teste o cert. em: certmgr.msc → Pessoal');
    logger.error('  - Reinicie o navegador se necessário');
    logger.error('========================================');
  }

  private showNetworkError(): void {
    logger.error('========================================');
    logger.error('ERRO DE REDE AO CONECTAR NO PJe');
    logger.error('========================================');
    logger.error('Verificar:');
    logger.error('  1. Conexão com a internet');
    logger.error('  2. Firewall do escritório');
    logger.error('  3. VPN (se aplicável)');
    logger.error('  4. DNS funcionando');
    logger.error('========================================');
  }

  private showGenericLoadError(description: string): void {
    logger.error('========================================');
    logger.error('ERRO GENÉRICO AO CARREGAR PJe');
    logger.error('Descrição:', description);
    logger.error('========================================');
  }

  // ============================================================
  //  CLEANUP
  // ============================================================

  /**
   * Limpa recursos (intervalos, etc).
   */
  private cleanup(): void {
    if (this.urlPollInterval) {
      clearInterval(this.urlPollInterval);
      this.urlPollInterval = null;
    }
  }

  /**
   * Corre `promise` contra um teto de tempo — se estourar, rejeita com um
   * erro identificável em vez de deixar quem chamou esperando pra sempre.
   * Não cancela a `promise` original (o Electron não dá um jeito limpo de
   * abortar um `executeJavaScript` em andamento) — só para de esperar por
   * ela, então quem chama ainda precisa descartar o recurso associado
   * (ver uso em `requestPdpjApi`/`requestPdpjApiBinario`, que destroem a
   * janela do pool em vez de devolvê-la quando isso acontece).
   */
  private withHardTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}: tempo limite de ${ms}ms excedido`)), ms);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
  }

  // ============================================================
  //  VALIDAÇÃO AUTOMÁTICA DA API EM SEGUNDO PLANO
  // ============================================================

  /**
   * Liga um verificador periódico: sempre que existir sessão de cookies
   * válida mas sem Bearer confirmado (login recente, token invalidado por
   * um 401/403 numa consulta, etc.), tenta revalidar sozinho — sem
   * depender do usuário clicar "Validar API agora" nem de uma tarefa da
   * fila tropeçar nisso na hora. Chamado uma vez em `registerIPCHandlers`.
   */
  startAutoValidation(intervalMs = INTERVALS.pdpjApiValidation): void {
    if (this.autoValidateTimer) return;
    this.autoValidateTimer = setInterval(() => void this.maybeValidateApi(), intervalMs);
    void this.maybeValidateApi();
  }

  stopAutoValidation(): void {
    if (this.autoValidateTimer) {
      clearInterval(this.autoValidateTimer);
      this.autoValidateTimer = null;
    }
  }

  private async maybeValidateApi(): Promise<void> {
    // Achado 04/08/2026: `resumePausedTasks()` só era chamado dentro do
    // fluxo COMPLETO de revalidação (abaixo) — com a sessão saudável (Bearer
    // ainda válido, sem precisar revalidar), esse fluxo nunca roda, e
    // `paused_login_required` nunca é destravada de novo. Resultado: fila
    // zerada em `pending`, sessão 100% saudável, e ainda assim 1000+
    // tarefas paradas esperando um gatilho que não vinha mais. Agora roda
    // a cada ciclo (mesmo timer de 5min), independente de precisar
    // revalidar o Bearer ou não — o backoff em si (resume/route.ts) já
    // decide quem está pronto pra tentar de novo.
    void this.resumePausedTasks();
    this.sweepQueryPool();
    // Roda mesmo sem sessão válida (o early return `if (!session) return`
    // vem depois) — é justamente o cenário sem sessão (ou com sessão
    // saudável mas fila travada por outro motivo) que esse alerta precisa
    // cobrir, não só o caminho reativo abaixo.
    void this.maybeCheckPendingBacklog();
    // Roda antes do resto (awaited, não `void`) — evita competir com a
    // checagem reativa logo abaixo pela mesma `ensureApiSession()` no
    // mesmo instante (as duas usam o guard de execução única, mas rodar em
    // sequência evita qualquer leitura de estado no meio da troca).
    await this.maybeRunProactiveRevalidation();

    const session = this.store.getValidSession();
    if (!session) return; // sem sessão de cookies salva — precisa logar, nada a fazer aqui
    // Antes só reagia a "token vazio" — um Bearer capturado ficava marcado
    // como "válido" pra sempre até alguém tomar 401 na prática. Agora
    // revalida também quando o `exp` real do JWT está perto (ou passou),
    // pegando a renovação silenciosa ANTES de qualquer requisição falhar.
    if (session.accessToken && !isTokenNearExpiry(session.tokenExpiresAt)) return;
    // Não precisa de guard próprio contra execução simultânea — `ensureApiSession()`
    // já compartilha uma única execução entre todos os chamadores (ver seu comentário).
    try {
      logger.info('Validacao automatica da API PDPJ (segundo plano) iniciada');
      const ok = await this.ensureApiSession();
      if (ok) {
        this.falhaValidacaoDesdeMs = null;
      } else {
        this.registrarFalhaValidacaoENotificarSeNecessario();
      }
    } catch (error: any) {
      logger.warn('Validacao automatica da API PDPJ falhou; tenta de novo no proximo ciclo', error?.message || error);
      this.registrarFalhaValidacaoENotificarSeNecessario();
    }
  }

  /**
   * Avisa o usuario quando a revalidacao automatica fica falhando por muito
   * tempo seguido — sem isso, a unica forma de descobrir que a sessao
   * morreu de vez e a fila de tarefas travar silenciosamente (como
   * aconteceu em 31/07/2026: 98% das tarefas pdpj_cnj do dia pausaram por
   * sessao expirada, sem nenhum aviso visivel). So notifica 1x por janela
   * de 30min, pra nao virar spam — o timer de 5min (INTERVALS.pdpjApiValidation)
   * ja tenta de novo sozinho o tempo todo.
   */
  private registrarFalhaValidacaoENotificarSeNecessario(): void {
    const agora = Date.now();
    if (this.falhaValidacaoDesdeMs === null) this.falhaValidacaoDesdeMs = agora;
    const falhandoHaMs = agora - this.falhaValidacaoDesdeMs;
    const jaAvisouRecente = this.ultimaNotificacaoFalhaMs !== null && agora - this.ultimaNotificacaoFalhaMs < 30 * 60_000;
    if (falhandoHaMs < 15 * 60_000 || jaAvisouRecente) return;

    this.ultimaNotificacaoFalhaMs = agora;
    logger.error('PDPJ: revalidacao automatica falhando ha mais de 15min seguidos; avisando o usuario', {
      falhandoHaMinutos: Math.round(falhandoHaMs / 60_000),
    });
    recordDiagnosticEvent('pdpj_api_validation_stuck', 'error', 'Revalidacao automatica da API PDPJ falhando ha mais de 15min seguidos', {
      falhandoHaMinutos: Math.round(falhandoHaMs / 60_000),
    });
    try {
      new Notification({
        title: `${APP_NAME} - Sessão PDPJ precisa de atenção`,
        body: 'A renovação automática está falhando há um tempo. Abra o app e reconecte o Portal PDPJ/Jus pra sincronização voltar a funcionar.',
        silent: false,
      }).show();
    } catch (error: any) {
      logger.warn('PDPJ: falha ao mostrar notificacao de sessao travada:', error?.message || error);
    }
  }

  /**
   * Roda 1x por dia, na primeira checagem de 5min a partir da hora-alvo
   * (`PROACTIVE_REVALIDATION_HOUR_LOCAL`) — força uma revalidação completa
   * mesmo com um Bearer que ainda "parece" válido pelo nosso relógio, pra
   * confirmar de verdade que a sessão funciona antes do expediente
   * começar, em vez de só reagir depois que uma tarefa real falhar. Não
   * tenta nada se não existir sessão de cookies (aí só um login manual
   * resolve, e isso exige o usuário abrir o app de qualquer forma).
   *
   * Achado 19/08/2026, auditando os logs: a checagem original exigia hora
   * EXATAMENTE igual à hora-alvo (`!==`) — como o app só é aberto quando
   * o usuário liga o PC (confirmado: sempre entre 08h e 08h15 local, nunca
   * antes das 7h), a janela de 1h nunca existiu de verdade, e esse
   * recurso nunca disparou nem uma vez em nenhum log histórico. Corrigido
   * pra "já passou da hora-alvo hoje" (`>=`) — dispara na primeira
   * checagem do dia a partir da hora-alvo, não importa a que horas o app
   * de fato abrir.
   */
  private async maybeRunProactiveRevalidation(): Promise<void> {
    const now = new Date();
    if (now.getHours() < PROACTIVE_REVALIDATION_HOUR_LOCAL) return;
    const todayKey = now.toISOString().slice(0, 10);
    if (this.proactiveRevalidationDoneOnDate === todayKey) return;
    if (!this.store.getValidSession()) return;

    this.proactiveRevalidationDoneOnDate = todayKey;
    logger.info('PDPJ: revalidacao proativa antes do expediente iniciada');
    recordDiagnosticEvent('pdpj_proactive_revalidation_started', 'started', 'Revalidacao proativa antes do horario de pico iniciada');
    try {
      const ok = await this.ensureApiSession(true);
      if (ok) {
        this.falhaValidacaoDesdeMs = null;
        logger.info('PDPJ: revalidacao proativa concluida com sucesso');
        recordDiagnosticEvent('pdpj_proactive_revalidation_finished', 'success', 'Revalidacao proativa concluida com sucesso');
      } else {
        this.avisarFalhaProativaImediatamente();
      }
    } catch (error: any) {
      logger.warn('PDPJ: revalidacao proativa deu erro:', error?.message || error);
      this.avisarFalhaProativaImediatamente();
    }
  }

  /**
   * Diferente de `registrarFalhaValidacaoENotificarSeNecessario` (que só
   * avisa depois de 15min de falhas seguidas, pra não virar spam de um
   * timer que roda o dia todo): uma falha na checagem proativa da manhã
   * merece aviso na hora — é justamente a checagem feita pra pegar o
   * problema ANTES do expediente, não depois de já ter incomodado por
   * 15min durante ele.
   */
  private avisarFalhaProativaImediatamente(): void {
    logger.error('PDPJ: revalidacao proativa antes do expediente falhou');
    recordDiagnosticEvent('pdpj_proactive_revalidation_failed', 'error', 'Revalidacao proativa antes do horario de pico falhou');
    try {
      new Notification({
        title: `${APP_NAME} - Sessão PDPJ precisa de atenção`,
        body: 'A checagem automática desta manhã não conseguiu confirmar a sessão do PDPJ. Abra o app e reconecte o Portal PDPJ/Jus antes de começar a sincronizar.',
        silent: false,
      }).show();
    } catch (error: any) {
      logger.warn('PDPJ: falha ao mostrar notificacao de revalidacao proativa:', error?.message || error);
    }
    // Mantém o contador de falha "normal" andando também — se o problema
    // continuar durante o expediente, o alerta de 15min (acima) ainda
    // dispara como rede de segurança.
    this.registrarFalhaValidacaoENotificarSeNecessario();
  }

  /**
   * Checa o backlog REAL de tarefas `pending` no servidor (diferente do
   * `StatusReporter.setPendingTasks`, que só reflete o que este device tem
   * em andamento agora) — se ficar acima de `BACKLOG_ALERT_THRESHOLD` por
   * `BACKLOG_ALERT_SUSTAINED_MS` seguidos sem cair, avisa. Cobre o cenário
   * achado 14/08/2026: sessão revalidando com sucesso a cada 5min, Bearer
   * saudável, e mesmo assim 327 tarefas `pdpj_cnj` presas em `pending` sem
   * nenhum alerta disparar (o único que existia até então só reagia a
   * falha de validação).
   */
  private async maybeCheckPendingBacklog(): Promise<void> {
    if (!this.pairing) return;
    let count: number;
    try {
      count = await new TaskQueueClient(this.pairing).getPendingCount('pdpj');
    } catch (error: any) {
      logger.warn('PDPJ: falha ao checar backlog de tarefas pendentes:', error?.message || error);
      return;
    }

    if (count < BACKLOG_ALERT_THRESHOLD) {
      this.backlogAltoDesdeMs = null;
      return;
    }

    const agora = Date.now();
    if (this.backlogAltoDesdeMs === null) this.backlogAltoDesdeMs = agora;
    const persistindoHaMs = agora - this.backlogAltoDesdeMs;
    const jaAvisouRecente = this.ultimaNotificacaoBacklogMs !== null && agora - this.ultimaNotificacaoBacklogMs < BACKLOG_NOTIFICACAO_COOLDOWN_MS;
    if (persistindoHaMs < BACKLOG_ALERT_SUSTAINED_MS || jaAvisouRecente) return;

    this.ultimaNotificacaoBacklogMs = agora;
    logger.error(`PDPJ: fila com ${count} tarefa(s) pendente(s) ha mais de ${Math.round(persistindoHaMs / 60_000)}min seguidos, sem cair`, {
      pendingCount: count,
      persistindoHaMinutos: Math.round(persistindoHaMs / 60_000),
    });
    recordDiagnosticEvent('pdpj_backlog_stuck', 'error', `Fila com ${count} tarefa(s) pdpj pendente(s) ha mais de ${Math.round(persistindoHaMs / 60_000)}min seguidos`, {
      pendingCount: count,
    });
    try {
      new Notification({
        title: `${APP_NAME} - Fila do PDPJ não está andando`,
        body: `${count} tarefas pendentes há mais de ${Math.round(persistindoHaMs / 60_000)}min sem cair. Abra o app e confira a tela de Fila/Diagnóstico.`,
        silent: false,
      }).show();
    } catch (error: any) {
      logger.warn('PDPJ: falha ao mostrar notificacao de backlog:', error?.message || error);
    }
  }

  // ============================================================
  //  QUERIES
  // ============================================================

  /**
   * Retorna o status atual (pro renderer via IPC).
   */
  async getStatus(): Promise<
    | { state: 'disconnected' }
    | { state: 'connected'; session: PublicSession }
  > {
    const session = this.store.getValidSession();
    if (!session) {
      return { state: 'disconnected' };
    }
    return { state: 'connected', session: this.toPublicSession(session) };
  }

  /**
   * Atualiza uma sessao antiga de cookies para uma sessao API PDPJ sem novo
   * login. Pode ser chamado por várias origens ao mesmo tempo (clique
   * manual em "Validar API agora", `ensureSession()` de uma tarefa da fila,
   * o verificador automático em segundo plano) — todas compartilham a
   * mesma `authWindow`, então rodar duas ao mesmo tempo faz uma navegação
   * cancelar a outra no meio (achado em log real, 29/07/2026: duas
   * validações simultâneas produziam pares de eventos ~2s um do outro e
   * nenhuma nunca terminava). Esse guard garante só uma execução por vez —
   * quem chamar enquanto já tem uma rodando reaproveita o mesmo resultado.
   */
  /**
   * `force`: pula o "já validado, nada a fazer" e refaz a captura do zero
   * mesmo com um Bearer em cache válido — usado no clique manual em
   * "Validar API agora" (um pedido explícito do usuário pra checar agora
   * deveria sempre checar de verdade, não só devolver o cache). O
   * verificador automático em segundo plano e `ensureSession()` das
   * tarefas da fila continuam sem forçar (não tem motivo bom pra jogar
   * fora um Bearer que ainda está válido só porque um timer disparou).
   */
  async ensureApiSession(force = false): Promise<boolean> {
    if (this.ensureApiSessionPromise) {
      logger.info('Validacao da API PDPJ ja em andamento; reaproveitando execucao existente');
      return this.ensureApiSessionPromise;
    }
    if (force) this.store.clearAccessToken();
    this.ensureApiSessionPromise = this.doEnsureApiSession(force);
    try {
      return await this.ensureApiSessionPromise;
    } finally {
      this.ensureApiSessionPromise = null;
    }
  }

  private async doEnsureApiSession(force = false): Promise<boolean> {
    // Login manual em andamento usa a mesma `authWindow` que essa validação
    // técnica reutilizaria — nunca competir com ele (ver comentário do
    // campo `loginEmAndamento`). O timer de 5min tenta de novo sozinho no
    // próximo ciclo, então não precisa fazer nada além de esperar.
    if (this.loginEmAndamento) {
      logger.info('Validacao PDPJ adiada: login manual em andamento');
      return false;
    }
    // Circuit breaker de falhas consecutivas — `force` (clique manual em
    // "Validar API agora", ou a revalidação proativa da manhã) sempre
    // ignora o cooldown, porque são pedidos deliberados e pouco
    // frequentes, não o loop de tarefas que causou o problema original.
    if (!force && this.validacaoEmCooldownAteMs !== null) {
      if (Date.now() < this.validacaoEmCooldownAteMs) {
        logger.debug('Validacao PDPJ pulada: em cooldown apos falhas consecutivas de captura do Bearer', {
          faltamMs: this.validacaoEmCooldownAteMs - Date.now(),
        });
        return false;
      }
      this.validacaoEmCooldownAteMs = null;
    }
    logger.info('Validacao da API PDPJ em segundo plano iniciada');
    const current = this.store.getValidSession();
    if (!current) {
      logger.warn('Validacao PDPJ cancelada: nenhuma sessao salva disponivel');
      return false;
    }
    if (current.accessToken && !isTokenNearExpiry(current.tokenExpiresAt)) {
      logger.info('Validacao PDPJ ignorada: Bearer ja salvo e ainda valido', {
        tokenExpiresAt: current.tokenExpiresAt?.toISOString(),
      });
      return true;
    }
    // Janela dedicada, sempre nova — nunca reaproveitada entre ciclos (ver
    // docs/roadmap/28-pdpj-auth-robustez.md, item 3.1). Antes essa janela
    // era mantida viva e reutilizada a cada ciclo de 5min (a mesma
    // instância que, em alguns dias, ficava presa fora da área autenticada
    // sem nunca se recuperar sozinha — achado 14/08/2026). Como só existe
    // uma execução de `doEnsureApiSession` por vez (`ensureApiSession()`
    // já garante isso via `ensureApiSessionPromise`), não tem risco de duas
    // janelas de revalidação coexistindo.
    const window = new BrowserWindow({
      width: 1000,
      height: 750,
      show: SHOW_PDPJ_VALIDATION_WINDOW,
      icon: loadAppIcon(),
      autoHideMenuBar: true,
      // `backgroundThrottling: false` — achado 31/07/2026 via HAR real:
      // com a janela VISIVEL, 8 ciclos seguidos de revalidacao
      // capturaram Bearer com sucesso (100%), contra ~2% em produção
      // (janela sempre oculta, `show: false`). Suspeita forte: o
      // Chromium por padrao throttla timers/rAF de janela em segundo
      // plano pra economizar recurso — pode ser exatamente o que quebra
      // o SSO silencioso do Keycloak (que depende de timers/iframe) só
      // quando a janela fica escondida. Mantém oculta (nao e assim que
      // deve rodar visivel em produção) mas sem o throttling.
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false },
    });
    this.revalidationWindow = window;
    window.setTitle('MeuJudi Sync - Diagnostico PDPJ');
    logger.info('Janela tecnica do Portal PDPJ criada para capturar o Bearer');
    if (OPEN_DEVTOOLS_NA_JANELA_TECNICA) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
    window.webContents.on('did-navigate', (_event, url) => {
      logger.info('PDPJ validacao did-navigate:', safeUrlForLog(url));
    });
    window.webContents.on('did-navigate-in-page', (_event, url) => {
      logger.info('PDPJ validacao did-navigate-in-page:', safeUrlForLog(url));
    });
    window.webContents.on('did-finish-load', () => {
      if (window.isDestroyed()) return;
      logger.info('PDPJ validacao did-finish-load:', safeUrlForLog(window.webContents.getURL()));
    });
    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logger.warn('PDPJ validacao did-fail-load:', { errorCode, errorDescription, validatedURL: safeUrlForLog(validatedURL), isMainFrame });
    });
    window.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['https://portaldeservicos.pdpj.jus.br/*'] },
        (details, callback) => {
          const authorization = details.requestHeaders.Authorization || details.requestHeaders.authorization;
          if (authorization?.startsWith('Bearer ')) {
            this.capturedBearer = authorization.slice(7).trim();
            logger.info('PDPJ requisicao autenticada detectada', {
              method: details.method,
              url: safeUrlForLog(details.url),
              headerNames: Object.keys(details.requestHeaders).sort(),
              bearerLength: this.capturedBearer.length,
            });
          }
          callback({ requestHeaders: details.requestHeaders });
        },
      );
    window.webContents.session.webRequest.onCompleted(
      { urls: ['https://portaldeservicos.pdpj.jus.br/*'] },
      (details) => {
        logger.info('PDPJ requisicao concluida', {
          method: details.method,
          url: safeRequestUrlForLog(details.url),
          statusCode: details.statusCode,
          responseHeaderNames: Object.keys(details.responseHeaders ?? {}).sort(),
        });
      },
    );
    // Cada tentativa de validação começa sem Bearer capturado — evita usar
    // por engano um valor de uma tentativa anterior que falhou antes de
    // completar o fluxo.
    this.capturedBearer = undefined;
    if (SHOW_PDPJ_VALIDATION_WINDOW) {
      window.setAlwaysOnTop(true);
      window.show();
      window.setSkipTaskbar(false);
      window.focus();
      window.moveTop();
      setTimeout(() => {
        if (!window.isDestroyed()) window.setAlwaysOnTop(false);
      }, 3000);
    }

    try {
      for (const cookie of current.cookies) {
        const domain = cookie.domain.replace(/^\./, '');
        await electronSession.defaultSession.cookies.set({
          url: `https://${domain}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          // Sem isso, o cookie reaplicado vira "session cookie" (sem
          // expirationDate) — estimateExpiry() então não acha nenhum cookie
          // com expiração real e cai no palpite fixo de 7 dias a cada ciclo
          // de revalidação (a cada 5min), fazendo a tela de "expira em Xh"
          // parecer travada/resetando (achado 31/07/2026, relatado pelo Caio
          // como "quando passa o tempo ele volta pra um tempo fixo").
          expirationDate: cookie.expirationDate,
        });
      }
      const token = await this.withHardTimeout(
        this.ensurePortalBearer(window, () => this.capturedBearer),
        ENSURE_PORTAL_BEARER_HARD_TIMEOUT_MS,
        'PDPJ (captura de Bearer)',
      );
      logger.info('Bearer PDPJ capturado em segundo plano; atualizando sessao local');
      // Passa `current.createdAt`: isso é revalidação de token em segundo
      // plano, não um novo login — sem preservar a data original, cada
      // ciclo de 5min reescrevia "Sessão criada em" pra agora, apagando o
      // horário real do login.
      await this.captureSession(window, token, current.createdAt);
      recordDiagnosticEvent('pdpj_session_upgraded', 'success', 'Sessao PDPJ antiga atualizada automaticamente para a API');
      await this.resumePausedTasks();
      this.falhasValidacaoConsecutivas = 0;
      this.validacaoEmCooldownAteMs = null;
      return true;
    } catch (error: any) {
      logger.error('Falha na validacao PDPJ em segundo plano:', error?.message || error);
      recordDiagnosticEvent('pdpj_session_upgrade_failed', 'warning', error.message || 'Nao foi possivel atualizar a sessao PDPJ');
      // Circuit breaker: sem isso, cada tarefa `pdpj_cnj` pendente dispara
      // uma nova tentativa assim que a promise compartilhada da anterior
      // termina (evidencia ao vivo em 21/08/2026: 10 falhas de 70s
      // seguidas, gap de 24ms entre elas, 13min sem nenhuma recuperacao).
      this.falhasValidacaoConsecutivas += 1;
      if (this.falhasValidacaoConsecutivas >= VALIDATION_FAILURE_THRESHOLD) {
        this.validacaoEmCooldownAteMs = Date.now() + VALIDATION_COOLDOWN_MS;
        logger.warn('Circuit breaker: pausando validacao PDPJ por falhas consecutivas de captura do Bearer', {
          falhasConsecutivas: this.falhasValidacaoConsecutivas,
          cooldownMs: VALIDATION_COOLDOWN_MS,
        });
      }
      return false;
    } finally {
      this.cleanup();
      // Sempre destruída ao final do ciclo, com sucesso ou falha — nunca
      // fica viva pro próximo ciclo (era isso, reaproveitar a mesma janela,
      // que deixava um estado ruim de um ciclo contaminar o próximo; ver
      // comentário no topo do método e docs/roadmap/28-pdpj-auth-robustez.md).
      if (!window.isDestroyed()) window.destroy();
      if (this.revalidationWindow === window) this.revalidationWindow = null;
    }
  }

  /**
   * Executa uma consulta numa janela Chromium autenticada no PDPJ. O gateway
   * aceita a chamada do Portal, mas rejeita o mesmo Bearer quando ele e
   * repetido por um fetch Node fora do contexto do navegador — por isso
   * sempre passa por uma BrowserWindow real, nunca por node-fetch direto.
   *
   * Usa um pool de até `MAX_QUERY_WINDOWS` janelas ocultas dedicadas só a
   * consultas (separado da `authWindow` de login) — permite paralelizar a
   * busca de texto de vários documentos sem monopolizar uma única janela.
   * Nunca testado ao vivo com 2 janelas simultâneas ainda; se a segunda
   * falhar por algum motivo específico do gateway, o pool continua
   * funcionando com 1 (só perde o paralelismo, não quebra).
   */
  async requestPdpjApi(url: string, authorization: string): Promise<{ status: number; contentType: string | null; body: string; retryAfterHeader: string | null }> {
    const session = this.store.getValidSession();
    if (!session) throw new Error('Sessao autenticada do PDPJ nao esta disponivel.');

    const { window, release } = await this.acquireQueryWindow(session);
    let falhou = false;
    try {
      // Fecha modal "Navegação Guiada" antes de interagir com o DOM
      await this.dismissGuidedNavigationModal(window);
      const urlLiteral = JSON.stringify(url);
      const authorizationLiteral = JSON.stringify(authorization);
      let result: { status: number; contentType: string | null; body: string; retryAfterHeader: string | null };
      try {
        result = await this.withHardTimeout(
          window.webContents.executeJavaScript(`(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ${TIMEOUTS.pdpjChromiumRequest});
            try {
              const response = await fetch(${urlLiteral}, {
                method: 'GET',
                credentials: 'include',
                signal: controller.signal,
                headers: {
                  Accept: 'application/json, text/plain, */*',
                  Authorization: ${authorizationLiteral},
                  skipErrorInterceptor: 'true'
                }
              });
              return {
                status: response.status,
                contentType: response.headers.get('content-type'),
                body: await response.text(),
                retryAfterHeader: response.headers.get('retry-after')
              };
            } finally {
              clearTimeout(timeoutId);
            }
          })()`, true),
          TIMEOUTS.pdpjChromiumRequest + POOL_OPERATION_TIMEOUT_MARGIN_MS,
          'PDPJ API (consulta)',
        ) as { status: number; contentType: string | null; body: string; retryAfterHeader: string | null };
      } catch (error: any) {
        logger.warn('PDPJ API: falha ao executar consulta no Chromium', {
          message: error?.message || String(error),
          currentUrl: safeUrlForLog(window.webContents.getURL()),
        });
        throw error;
      }

      logger.info('PDPJ API: resposta recebida pelo contexto Chromium', {
        status: result.status,
        contentType: result.contentType,
        bodyLength: result.body.length,
      });
      return result;
    } catch (error) {
      falhou = true;
      throw error;
    } finally {
      // Falhou (inclusive por timeout rígido): destroi a janela em vez de
      // devolver pro pool — não dá pra confiar que ela ainda está num
      // estado bom depois de travar ou estourar o tempo (achado
      // 14/08/2026, mesma causa do loop de redirecionamento visto na
      // janela de revalidação). Sucesso continua devolvendo normalmente.
      release({ destroy: falhou });
    }
  }

  /**
   * Busca sob demanda o binário de UM documento (hrefBinario), pra
   * visualizar/baixar no Web — nunca usado pela varredura em lote
   * (pdpj-tasks.ts::handlePdpjCnj continua proibido de tocar isso, ver
   * tests/no-secrets-no-pdf.test.js). Só chamado a partir de
   * document-requests.ts, um documento por vez, por pedido explícito.
   *
   * `executeJavaScript` só devolve tipos serializáveis — não dá pra trazer
   * um Buffer/Blob bruto pro processo main, então a conversão pra base64
   * acontece dentro da própria página (fetch -> arrayBuffer -> base64).
   */
  async requestPdpjApiBinario(url: string, authorization: string): Promise<{ status: number; contentType: string | null; base64: string }> {
    const session = this.store.getValidSession();
    if (!session) throw new Error('Sessao autenticada do PDPJ nao esta disponivel.');

    const { window, release } = await this.acquireQueryWindow(session);
    let falhou = false;
    try {
      // Fecha modal "Navegação Guiada" antes de interagir com o DOM
      await this.dismissGuidedNavigationModal(window);
      const urlLiteral = JSON.stringify(url);
      const authorizationLiteral = JSON.stringify(authorization);
      let result: { status: number; contentType: string | null; base64: string };
      try {
        // Timeout bem mais folgado que o de consulta (`pdpjChromiumRequest`)
        // — isso aqui baixa o PDF inteiro, que pode ser grande.
        result = await this.withHardTimeout(
          window.webContents.executeJavaScript(`(async () => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), ${TIMEOUTS.pdfDownload});
            try {
              const response = await fetch(${urlLiteral}, {
                method: 'GET',
                credentials: 'include',
                signal: controller.signal,
                headers: {
                  Accept: 'application/pdf, application/octet-stream, */*',
                  Authorization: ${authorizationLiteral},
                  skipErrorInterceptor: 'true'
                }
              });
              const buffer = await response.arrayBuffer();
              const bytes = new Uint8Array(buffer);
              let binary = '';
              for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
              return {
                status: response.status,
                contentType: response.headers.get('content-type'),
                base64: btoa(binary)
              };
            } finally {
              clearTimeout(timeoutId);
            }
          })()`, true),
          TIMEOUTS.pdfDownload + POOL_OPERATION_TIMEOUT_MARGIN_MS,
          'PDPJ API (binario)',
        ) as { status: number; contentType: string | null; base64: string };
      } catch (error: any) {
        logger.warn('PDPJ API: falha ao executar busca de binario no Chromium', {
          message: error?.message || String(error),
          currentUrl: safeUrlForLog(window.webContents.getURL()),
        });
        throw error;
      }

      logger.info('PDPJ API: binario recebido pelo contexto Chromium', {
        status: result.status,
        contentType: result.contentType,
        base64Length: result.base64.length,
      });
      return result;
    } catch (error) {
      falhou = true;
      throw error;
    } finally {
      release({ destroy: falhou });
    }
  }

  // ============================================================
  //  POOL DE JANELAS DE CONSULTA (paralelismo limitado)
  // ============================================================

  /** Pega uma janela livre do pool (cria se ainda não estiver no teto) ou espera alguém liberar. */
  private async acquireQueryWindow(session: PdpjSession): Promise<{ window: BrowserWindow; release: (opts?: { destroy?: boolean }) => void }> {
    const free = this.queryPool.find((slot) => !slot.busy && !slot.window.isDestroyed());
    if (free) {
      free.busy = true;
      return { window: free.window, release: (opts) => this.releaseQueryWindow(free, opts?.destroy) };
    }

    this.queryPool = this.queryPool.filter((slot) => !slot.window.isDestroyed());
    if (this.queryPool.length < getMaxConcurrentPdpj()) {
      const window = await this.createQueryWindow(session);
      const slot: QueryWindowSlot = { window, busy: true, idleSince: Date.now() };
      this.queryPool.push(slot);
      return { window, release: (opts) => this.releaseQueryWindow(slot, opts?.destroy) };
    }

    // Pool cheio e todas ocupadas: espera alguém liberar e tenta de novo.
    await new Promise<void>((resolve) => this.queryWaiters.push(resolve));
    return this.acquireQueryWindow(session);
  }

  /**
   * Fecha janela livre ociosa há mais de `POOL_IDLE_TIMEOUT_MS`, e encolhe o
   * excedente livre se o teto calculado agora (RAM/CPU, ver
   * pdpj-concurrency.ts) for menor que o tamanho atual do pool — chamado
   * periodicamente por `maybeValidateApi`. Nunca mexe em janela ocupada;
   * reabre sozinho na próxima consulta (`acquireQueryWindow`), então fechar
   * aqui não perde nada — sessão/token continuam salvos no CookieStore,
   * independente da janela (ver dúvida do Caio, 04/08/2026).
   */
  private sweepQueryPool(): void {
    this.queryPool = this.queryPool.filter((slot) => !slot.window.isDestroyed());
    if (this.queryPool.length === 0) return;

    const teto = getMaxConcurrentPdpj();
    const agora = Date.now();
    let excedente = Math.max(0, this.queryPool.length - teto);

    const restantes: QueryWindowSlot[] = [];
    for (const slot of this.queryPool) {
      if (slot.busy) {
        restantes.push(slot);
        continue;
      }
      const ociosaDemais = agora - slot.idleSince > POOL_IDLE_TIMEOUT_MS;
      const encolhePool = excedente > 0;
      if (ociosaDemais || encolhePool) {
        if (encolhePool) excedente -= 1;
        if (!slot.window.isDestroyed()) slot.window.close();
        logger.info('PDPJ API: janela do pool de consultas fechada', {
          motivo: ociosaDemais ? 'ociosidade' : 'encolhendo pra caber no teto atual',
          poolAntes: this.queryPool.length,
          tetoAtual: teto,
        });
        continue;
      }
      restantes.push(slot);
    }
    this.queryPool = restantes;
  }

  /**
   * `destroy: true` — a operação que usou essa janela falhou (inclusive por
   * timeout rígido, ver `withHardTimeout`) e ela não volta pro pool: é
   * destruída e removida, liberando a vaga pra uma janela nova e limpa na
   * próxima `acquireQueryWindow`. Sem isso, uma janela travada continuava
   * sendo "devolvida" como se estivesse boa, e a próxima consulta que a
   * pegasse herdava o mesmo problema (achado 14/08/2026, mesma classe de
   * bug do loop de redirecionamento na janela de revalidação — ver
   * docs/roadmap/28-pdpj-auth-robustez.md, item 3.3).
   */
  private releaseQueryWindow(slot: QueryWindowSlot, destroy = false): void {
    if (destroy) {
      this.queryPool = this.queryPool.filter((s) => s !== slot);
      if (!slot.window.isDestroyed()) slot.window.destroy();
      logger.warn('PDPJ API: janela do pool destruida (nao devolvida) apos falha/timeout', {
        poolSizeDepois: this.queryPool.length,
      });
    } else {
      slot.busy = false;
      slot.idleSince = Date.now();
    }
    const next = this.queryWaiters.shift();
    if (next) next();
  }

  /**
   * Fecha o modal "Você está na navegação guiada" do PDPJ se estiver aberto.
   * Chamado antes de cada interação com o Portal pra garantir que a interface
   * não está bloqueada por esse popup (detectado em 05/08/2026).
   */
  private async dismissGuidedNavigationModal(window: BrowserWindow): Promise<void> {
    try {
      await window.webContents.executeJavaScript(`
        (function() {
          var botoes = document.querySelectorAll('button');
          var btnPular = Array.prototype.find.call(botoes, function(btn) {
            return btn.textContent.trim() === 'Pular';
          });
          if (btnPular) {
            btnPular.click();
            console.log('[CS] Modal de navegação guiada fechado');
          }
        })();
      `);
    } catch {
      // Modal não existe ou página não carregou — ignora silenciosamente
    }
  }

  /** Cria uma janela oculta nova do pool: aplica os cookies da sessão salva e navega pro Portal uma vez. */
  private async createQueryWindow(session: PdpjSession): Promise<BrowserWindow> {
    logger.info('PDPJ API: criando janela do pool de consultas', { poolSize: this.queryPool.length + 1 });
    for (const cookie of session.cookies) {
      const domain = cookie.domain.replace(/^\./, '');
      await electronSession.defaultSession.cookies.set({
        url: `https://${domain}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
      });
    }

    const window = new BrowserWindow({
      width: 1000,
      height: 750,
      show: false,
      icon: loadAppIcon(),
      autoHideMenuBar: true,
      // Mesmo achado da janela tecnica de validacao (ver comentario lá) —
      // este pool tambem e sempre oculto e o comentario logo abaixo já
      // descreve o mesmo sintoma (ERR_ABORTED no SSO silencioso).
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false },
    });
    window.setTitle('MeuJudi Sync - Consulta PDPJ');
    if (OPEN_DEVTOOLS_NA_JANELA_TECNICA) {
      window.webContents.openDevTools({ mode: 'detach' });
    }
    window.on('closed', () => {
      this.queryPool = this.queryPool.filter((slot) => slot.window !== window);
    });
    try {
      await window.loadURL(`${PDPJ_PORTAL_URL}consulta`);
    } catch (error: any) {
      // Achado em log real (29/07/2026): o Portal as vezes dispara uma
      // reautenticacao silenciosa via SSO (prompt=none) logo na primeira
      // navegacao pro /consulta — o Electron reporta ERR_ABORTED mesmo a
      // pagina terminando de carregar depois (mesmo padrao ja tolerado em
      // ensurePortalBearer). Tratar isso como falha fatal aqui deixava a
      // janela orfa (nunca entrava no pool, nunca era fechada) — toda nova
      // tentativa criava outra janela, vazando memoria sem limite.
      logger.warn('PDPJ API: loadURL da janela do pool rejeitou (tolerado, mesma causa do redirecionamento silencioso)', error?.message || error);
    }
    // Da um tempo pra pagina assentar depois do redirecionamento silencioso
    // antes de devolver a janela pro pool — sem isso o primeiro fetch podia
    // rodar no meio da navegacao ainda em andamento.
    if (window.webContents.isLoading()) {
      await new Promise<void>((resolve) => {
        const onSettled = () => resolve();
        window.webContents.once('did-finish-load', onSettled);
        window.webContents.once('did-fail-load', onSettled);
        setTimeout(resolve, 5000);
      });
    }
    // Fecha o modal "Navegação Guiada" se apareceu durante o carregamento
    await this.dismissGuidedNavigationModal(window);
    return window;
  }

  /**
   * Desconecta (deleta sessão do disco).
   */
  async disconnect(): Promise<void> {
    this.store.clearSession();
    if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.close();
    this.authWindow = null;
    if (this.revalidationWindow && !this.revalidationWindow.isDestroyed()) this.revalidationWindow.destroy();
    this.revalidationWindow = null;
    for (const slot of this.queryPool) {
      if (!slot.window.isDestroyed()) slot.window.close();
    }
    this.queryPool = [];
    this.queryWaiters = [];
    try {
      await electronSession.defaultSession.clearStorageData({
        storages: ['cookies', 'localstorage'],
      });
    } catch (err) {
      logger.warn('Erro ao limpar cookies do Chromium:', err);
    }
    logger.info('PDPJ desconectado');
  }

  async openJus(): Promise<void> {
    if (!this.authWindow || this.authWindow.isDestroyed()) {
      const session = this.store.getValidSession();
      if (!session) throw new Error('Nenhuma sessao PDPJ autenticada esta disponivel.');
      this.authWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        show: true,
        icon: loadAppIcon(),
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
      });
      this.authWindow.setTitle('MeuJudi Sync - PDPJ/Jus.br');
      this.authWindow.webContents.session.webRequest.onBeforeSendHeaders(
        { urls: ['https://portaldeservicos.pdpj.jus.br/api/*'] },
        (details, callback) => {
          logger.info('PDPJ janela visivel: requisicao enviada', {
            method: details.method,
            url: safeRequestUrlForLog(details.url),
            searchAfter: paginationShape(details.url),
          });
          callback({ requestHeaders: details.requestHeaders });
        },
      );
      this.authWindow.webContents.session.webRequest.onCompleted(
        { urls: ['https://portaldeservicos.pdpj.jus.br/api/*'] },
        (details) => {
          logger.info('PDPJ janela visivel: requisicao concluida', {
            method: details.method,
            url: safeRequestUrlForLog(details.url),
            statusCode: details.statusCode,
            searchAfter: paginationShape(details.url),
          });
        },
      );
      for (const cookie of session.cookies) {
        const domain = cookie.domain.replace(/^\./, '');
        await electronSession.defaultSession.cookies.set({
          url: `https://${domain}${cookie.path || '/'}`,
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path || '/',
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
        });
      }
      await this.authWindow.loadURL(`${PDPJ_PORTAL_URL}consulta`);
    } else {
      this.authWindow.show();
      this.authWindow.setSkipTaskbar(false);
      this.authWindow.focus();
      this.authWindow.moveTop();
    }
    logger.info('Janela autenticada do PDPJ exibida pelo botao Abrir Jus.br');
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  private toPublicSession(session: PdpjSession): PublicSession {
    // `apiValidated`/`apiStatus` só checam se existe um token salvo, não
    // se ele ainda é válido — por isso o campo separado abaixo, com o
    // prazo real do JWT (bem mais curto que a sessão de cookies).
    return {
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      timeRemainingMs: session.expiresAt.getTime() - Date.now(),
      apiValidated: Boolean(session.accessToken),
      apiStatus: session.accessToken ? 'validated' : 'pending',
      apiTokenExpiresAt: session.tokenExpiresAt,
      apiTokenTimeRemainingMs: session.tokenExpiresAt ? session.tokenExpiresAt.getTime() - Date.now() : undefined,
    };
  }
}

function isPdpjReturn(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'www.jus.br' && parsed.pathname === '/';
  } catch {
    return false;
  }
}

function isPdpjAuthHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'sso.cloud.pje.jus.br' || host === 'sso.acesso.gov.br';
  } catch {
    return false;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return 'unknown';
  }
}

function safeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

function safeRequestUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    const parameterNames = Array.from(parsed.searchParams.keys());
    return `${parsed.origin}${parsed.pathname}${parameterNames.length ? `?${parameterNames.join('&')}` : ''}`;
  } catch {
    return 'unknown';
  }
}

function paginationShape(url: string): { count: number; format: string } {
  try {
    const values = new URL(url).searchParams.getAll('searchAfter');
    if (!values.length) return { count: 0, format: 'none' };
    const value = values[0];
    if (value.trim().startsWith('[')) return { count: values.length, format: 'json-array' };
    if (value.includes(',')) return { count: values.length, format: 'comma-separated' };
    return { count: values.length, format: values.length > 1 ? 'repeated-parameter' : 'single-value' };
  } catch {
    return { count: 0, format: 'invalid-url' };
  }
}
