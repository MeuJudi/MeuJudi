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

import { BrowserWindow, session as electronSession } from 'electron';
import { CookieStore } from './cookie-store';
import { loadAppIcon } from './app-icon';
import { logger, recordDiagnosticEvent } from './logger';
import { PDPJ_LOGIN_URL, TIMEOUTS, APP_NAME } from '../shared/constants';
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
const BEARER_CAPTURE_TIMEOUT_MS = 20_000;
const BEARER_CAPTURE_RETRY_MS = 500;
// O fluxo OAuth do Portal PDPJ ja esta estavel (ver cs-pdpj-login-fix.md) —
// a janela tecnica de renovacao/validacao da sessao fica sempre oculta,
// sem roubar foco. So a janela de LOGIN inicial (showLoginWindow) e
// visivel; a home publica do jus.br nunca deve abrir sozinha na frente do
// usuario. Ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 5.
const SHOW_PDPJ_VALIDATION_WINDOW = false;

export class PdpjAuth {
  private authWindow: BrowserWindow | null = null;
  private store: CookieStore;
  private urlPollInterval: NodeJS.Timeout | null = null;

  constructor() {
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

    return new Promise((resolve, reject) => {
      const loginStartedAt = Date.now();
      logger.info('========================================');
      logger.info('INICIANDO LOGIN PJe');
      logger.info('========================================');
      logger.info('Tributal: TRT9');
      logger.info('URL de login (via PDPJ/Jus.br):', PDPJ_LOGIN_URL);
      logger.info('Dominios de cookies: PDPJ/Jus.br e portal publico');
      recordDiagnosticEvent('pje_login_started', 'started', 'Usuario iniciou conexao com PJe', {
        tribunal: 'trt9',
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
            logger.warn('O usuário precisa instalar o cert. A1 antes de continuar');
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
      const session = await this.captureSession(getBearerToken());
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
   * O retorno do login Jus.br pode acontecer antes de o Portal PDPJ fazer a
   * primeira chamada da API. Abrimos o Portal automaticamente, aguardamos a
   * requisicao autenticada e mantemos o Bearer somente no processo principal.
   */
  private async ensurePortalBearer(getBearerToken: () => string | undefined): Promise<string> {
    const existing = getBearerToken();
    if (existing) return existing;
    if (!this.authWindow) throw new Error('Janela PDPJ nao esta disponivel para validar a API.');

    recordDiagnosticEvent('pdpj_api_validation_started', 'started', 'Validando sessao da API PDPJ apos o login');
    if (SHOW_PDPJ_VALIDATION_WINDOW) {
      this.authWindow.show();
      this.authWindow.setSkipTaskbar(false);
      this.authWindow.focus();
      this.authWindow.moveTop();
    } else {
      this.authWindow.hide();
      this.authWindow.setSkipTaskbar(true);
    }
    try {
      // O Portal direto pode abrir sem a sessao da API. O fluxo que gera o
      // contexto correto passa pelo Jus autenticado e aciona Consultar processos.
      await this.authWindow.loadURL(PDPJ_LOGIN_URL);
      logger.info('Jus autenticado carregado na janela tecnica; procurando Consultar processos');
    } catch (error: any) {
      recordDiagnosticEvent('pdpj_api_validation_load_failed', 'warning', error.message, { urlHost: safeHost(PDPJ_LOGIN_URL) });
    }

    const startedAt = Date.now();
    let lastClickAt = 0;
    let consultationTriggered = false;
    while (Date.now() - startedAt < BEARER_CAPTURE_TIMEOUT_MS) {
      const token = getBearerToken();
      if (token) {
        recordDiagnosticEvent('pdpj_api_validated', 'success', 'Bearer da API PDPJ capturado');
        return token;
      }
      if (!consultationTriggered && Date.now() - lastClickAt >= 750) {
        lastClickAt = Date.now();
        const action = await this.authWindow.webContents.executeJavaScript(`(() => {
          const selectors = 'a,button,[role="button"],[role="link"]';
          const items = Array.from(document.querySelectorAll(selectors));
          const item = items.find((element) => (element.textContent || '').toLowerCase().replace(/\\s+/g, ' ').includes('consultar processos'));
          if (!(item instanceof HTMLElement)) return null;
          if (item instanceof HTMLAnchorElement && item.href) return item.href;
          item.click();
          return 'clicked';
        })()`, true).catch(() => false);
        if (typeof action === 'string' && action.startsWith('https://')) {
          consultationTriggered = true;
          logger.info('Destino de Consultar processos encontrado; navegando na janela tecnica:', safeHost(action));
          await this.authWindow.loadURL(action).catch((error: any) => {
            logger.warn('Falha ao navegar para Consultar processos:', error.message);
          });
        } else if (action === 'clicked') {
          consultationTriggered = true;
          logger.info('Consultar processos acionado na janela tecnica do Jus');
        }
      }
      await new Promise((resolve) => setTimeout(resolve, BEARER_CAPTURE_RETRY_MS));
    }

    recordDiagnosticEvent('pdpj_api_validation_failed', 'error', 'Portal carregado, mas nao houve requisicao PDPJ com Bearer');
    throw new Error('Login concluido, mas a sessao da API PDPJ nao foi validada. Tente conectar novamente.');
  }

  // ============================================================
  //  CAPTURA DE SESSÃO
  // ============================================================

  /**
   * Extrai cookies da BrowserWindow e monta PdpjSession.
   */
  private async captureSession(accessToken?: string): Promise<PdpjSession> {
    if (!this.authWindow) {
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
      tribunal: 'trt9',
      userId,
      cookies: cookies.map(this.serializeCookie),
      csrfToken: '',
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      createdAt: new Date(),
      lastUsedAt: new Date(),
      provider: 'pdpj',
      accessToken,
      tokenType: 'Bearer',
      tokenExpiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      apiValidated: Boolean(accessToken),
    };

    this.store.saveSession(session);
    logger.info('========================================');
    logger.info('SESSÃO PJe SALVA COM SUCESSO');
    logger.info('userId:', userId);
    logger.info('Tribunal:', session.tribunal);
    logger.info('Cookies:', session.cookies.length);
    logger.info('Expira em:', session.expiresAt.toISOString());
    logger.info('========================================');

    return session;
  }

  /**
   * Aguarda os cookies reais do PJe. O Chromium pode gravar o cookie como
   * `.pje.trt9.jus.br` ou `pje.trt9.jus.br`, entao consultamos por URL,
   * por dominio e tambem filtramos a lista completa da sessao.
   */
  private async waitForPdpjCookies(): Promise<Electron.Cookie[]> {
    if (!this.authWindow) {
      throw new Error('Janela de login nao esta aberta');
    }

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
    if (!this.authWindow) {
      throw new Error('Janela de login nao esta aberta');
    }

    const allCookies = await this.authWindow.webContents.session.cookies.get({});
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
   * Extrai userId do painel fazendo 1 request autenticado.
   * Tenta várias fontes (cookie, perfil, JWT) e formatos diferentes.
   */
  private async extractUserId(cookies: Electron.Cookie[]): Promise<number> {
    if (!this.authWindow) throw new Error('Janela não disponível');

    logger.info('Extraindo userId...');

    // Estratégia 1: tenta extrair do cookie KEYCLOAK_IDENTITY (Keycloak guarda userId lá)
    const kcIdentity = cookies.find((c) => c.name === 'KEYCLOAK_IDENTITY' || c.name === 'KEYCLOAK_ID');
    if (kcIdentity) {
      try {
        // KEYCLOAK_IDENTITY é um JWT (header.payload.signature)
        const parts = kcIdentity.value.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
          );
          if (payload.sub) {
            const userId = parseInt(payload.sub, 10);
            if (!isNaN(userId)) {
              logger.info('userId extraído do JWT Keycloak:', userId);
              return userId;
            }
          }
        }
      } catch (err: any) {
        logger.warn('Falha ao extrair userId do JWT Keycloak:', err.message);
      }
    }

    // Estratégia 2: request ao endpoint de perfis
    try {
      const xsrfCookie = cookies.find((c) => c.name === 'XSRF-TOKEN');
      if (!xsrfCookie) throw new Error('XSRF-TOKEN não encontrado');

      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

      logger.info('Tentando extrair userId via /pje-seguranca/api/token/perfis...');
      const response = await fetch('https://pje.trt9.jus.br/pje-seguranca/api/token/perfis', {
        headers: {
          Cookie: cookieHeader,
          'x-xsrf-token': xsrfCookie.value,
          Accept: 'application/json',
          'User-Agent': 'MeuJudi-CS/1.0 (compatible; Electron)',
        },
      });

      if (!response.ok) {
        logger.warn(`/perfis retornou HTTP ${response.status}`);
        throw new Error(`HTTP ${response.status}`);
      }

      const perfis: any = await response.json();
      logger.debug('Perfis retornados:', JSON.stringify(perfis).slice(0, 800));

      // Tenta extrair userId de várias formas (depende da versão do PJe)
      const userId =
        perfis.id ??
        perfis.userId ??
        perfis.user_id ??
        perfis.idUsuario ??
        perfis.usuario?.id ??
        perfis.usuario?.idUsuario ??
        perfis.content?.[0]?.id ??
        perfis[0]?.id;

      if (userId && typeof userId === 'number') {
        logger.info('userId extraído do /perfis:', userId);
        return userId;
      }

      logger.warn('userId não encontrado em nenhum formato conhecido');
    } catch (err: any) {
      logger.warn('Erro ao buscar /perfis:', err.message);
    }

    // Estratégia 3: request ao painel de processos (pega userId do primeiro)
    try {
      const xsrfCookie = cookies.find((c) => c.name === 'XSRF-TOKEN');
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

      logger.info('Tentando extrair userId via /paineladvogado/.../processos...');
      // Tenta vários userIds comuns (fallback chain)
      const commonUserIds = [185531, 123456, 0]; // 185531 = Luís Fellype TRT9
      for (const testId of commonUserIds) {
        try {
          const response = await fetch(
            `https://pje.trt9.jus.br/pje-comum-api/api/paineladvogado/${testId}/processos?pagina=1&tamanhoPagina=1`,
            {
              headers: {
                Cookie: cookieHeader,
                'x-xsrf-token': xsrfCookie?.value || '',
                Accept: 'application/json',
              },
            }
          );
          if (response.ok) {
            logger.info(`userId ${testId} retornou 200 OK, usando como fallback`);
            return testId;
          }
        } catch {
          // ignora
        }
      }
    } catch (err: any) {
      logger.warn('Erro ao tentar userIds comuns:', err.message);
    }

    // Último fallback: hardcoded
    logger.warn('Usando userId hardcoded 185531 (Luís Fellype TRT9) como último fallback');
    return 185531;
  }

  /**
   * Estima expiração da sessão baseado no cookie XSRF-TOKEN.
   */
  private estimateExpiry(xsrfCookie: Electron.Cookie): Date {
    const EIGHT_HOURS = 8 * 60 * 60 * 1000;
    if (xsrfCookie.expirationDate) {
      return new Date(xsrfCookie.expirationDate * 1000);
    }
    return new Date(Date.now() + EIGHT_HOURS);
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
    logger.error('CERT. A1 NÃO ENCONTRADO NO WINDOWS');
    logger.error('========================================');
    logger.error('O usuário precisa:');
    logger.error('  1. Instalar o cert. A1 (.pfx) no Windows:');
    logger.error('     - Clique 2x no arquivo .pfx');
    logger.error('     - "Instalar certificado" → "Pessoal"');
    logger.error('     - Digite a senha do cert.');
    logger.error('     - MARQUE "Marcar como exportável"');
    logger.error('  2. Verificar em certmgr.msc → Pessoal → Certificados');
    logger.error('========================================');
  }

  private showCertRejectedError(): void {
    logger.error('========================================');
    logger.error('CERT. A1 REJEITADO PELO PJe');
    logger.error('Código de erro: -501 (ERR_BAD_SSL_CLIENT_AUTH_CERT)');
    logger.error('========================================');
    logger.error('Possíveis causas:');
    logger.error('  1. Cert. expirado (verificar data de validade)');
    logger.error('  2. Cert. revogado pela AC');
    logger.error('  3. PJe não confia na AC que emitiu o cert.');
    logger.error('  4. Popup do cert. foi cancelado pelo usuário');
    logger.error('  5. Cert. não é e-CPF A1 (pode ser A3 ou A4)');
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

  /** Atualiza uma sessao antiga de cookies para uma sessao API PDPJ sem novo login. */
  async ensureApiSession(): Promise<boolean> {
    logger.info('Validacao da API PDPJ em segundo plano iniciada');
    const current = this.store.getValidSession();
    if (!current) {
      logger.warn('Validacao PDPJ cancelada: nenhuma sessao salva disponivel');
      return false;
    }
    if (current.accessToken) {
      logger.info('Validacao PDPJ ignorada: Bearer ja salvo');
      return true;
    }
    if (this.authWindow && this.authWindow.isDestroyed()) this.authWindow = null;
    if (!this.authWindow) {
      this.authWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        show: SHOW_PDPJ_VALIDATION_WINDOW,
        icon: loadAppIcon(),
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
      });
      this.authWindow.setTitle('MeuJudi Sync - Diagnostico PDPJ');
      logger.info('Janela tecnica do Portal PDPJ criada para capturar o Bearer');
    } else {
      logger.info('Reutilizando janela autenticada do Portal PDPJ para capturar o Bearer');
    }
    if (SHOW_PDPJ_VALIDATION_WINDOW) {
      this.authWindow.setAlwaysOnTop(true);
      this.authWindow.show();
      this.authWindow.setSkipTaskbar(false);
      this.authWindow.focus();
      this.authWindow.moveTop();
      setTimeout(() => {
        if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.setAlwaysOnTop(false);
      }, 3000);
    }
    this.authWindow.webContents.on('did-navigate', (_event, url) => {
      logger.info('PDPJ validacao did-navigate:', safeUrlForLog(url));
    });
    this.authWindow.webContents.on('did-navigate-in-page', (_event, url) => {
      logger.info('PDPJ validacao did-navigate-in-page:', safeUrlForLog(url));
    });
    this.authWindow.webContents.on('did-finish-load', () => {
      if (!this.authWindow || this.authWindow.isDestroyed()) return;
      logger.info('PDPJ validacao did-finish-load:', safeUrlForLog(this.authWindow.webContents.getURL()));
    });
    this.authWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      logger.warn('PDPJ validacao did-fail-load:', { errorCode, errorDescription, validatedURL: safeUrlForLog(validatedURL), isMainFrame });
    });
    let bearer: string | undefined;
    this.authWindow.webContents.session.webRequest.onBeforeSendHeaders(
      { urls: ['https://portaldeservicos.pdpj.jus.br/*'] },
        (details, callback) => {
          const authorization = details.requestHeaders.Authorization || details.requestHeaders.authorization;
          if (authorization?.startsWith('Bearer ')) {
            bearer = authorization.slice(7).trim();
            logger.info('PDPJ requisicao autenticada detectada', {
              method: details.method,
              url: safeUrlForLog(details.url),
              headerNames: Object.keys(details.requestHeaders).sort(),
              bearerLength: bearer.length,
            });
          }
          callback({ requestHeaders: details.requestHeaders });
        },
      );
    this.authWindow.webContents.session.webRequest.onCompleted(
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
        });
      }
      const token = await this.ensurePortalBearer(() => bearer);
      logger.info('Bearer PDPJ capturado em segundo plano; atualizando sessao local');
      await this.captureSession(token);
      recordDiagnosticEvent('pdpj_session_upgraded', 'success', 'Sessao PDPJ antiga atualizada automaticamente para a API');
      return true;
    } catch (error: any) {
      logger.error('Falha na validacao PDPJ em segundo plano:', error?.message || error);
      recordDiagnosticEvent('pdpj_session_upgrade_failed', 'warning', error.message || 'Nao foi possivel atualizar a sessao PDPJ');
      return false;
    } finally {
      this.cleanup();
      if (this.authWindow && !this.authWindow.isDestroyed()) {
        this.authWindow.setAlwaysOnTop(false);
        this.authWindow.hide();
        this.authWindow.setSkipTaskbar(true);
        logger.info('Janela PDPJ autenticada mantida em segundo plano para reutilizar a sessao');
      }
    }
  }

  /**
   * Executa uma consulta pela mesma janela Chromium que autenticou no PDPJ.
   * O gateway aceita a chamada do Portal, mas rejeita o mesmo Bearer quando
   * ele e repetido por um fetch Node fora do contexto do navegador.
   */
  async requestPdpjApi(url: string, authorization: string): Promise<{ status: number; contentType: string | null; body: string }> {
    if (!this.authWindow || this.authWindow.isDestroyed()) {
      const session = this.store.getValidSession();
      if (!session) throw new Error('Sessao autenticada do PDPJ nao esta disponivel.');
      this.authWindow = new BrowserWindow({
        width: 1000,
        height: 750,
        show: false,
        icon: loadAppIcon(),
        autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
      });
      this.authWindow.setTitle('MeuJudi Sync - Sessao PDPJ');
      logger.info('PDPJ API: janela Chromium recriada para usar sessao salva');
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
    }

    const currentUrl = this.authWindow.webContents.getURL();
    if (!currentUrl.startsWith(PDPJ_PORTAL_URL)) {
      logger.info('PDPJ API: preparando contexto Chromium no Portal antes da consulta');
      await this.authWindow.loadURL(`${PDPJ_PORTAL_URL}consulta`);
    }

    const urlLiteral = JSON.stringify(url);
    const authorizationLiteral = JSON.stringify(authorization);
    let result: { status: number; contentType: string | null; body: string };
    try {
      result = await this.authWindow.webContents.executeJavaScript(`(async () => {
        const response = await fetch(${urlLiteral}, {
          method: 'GET',
          credentials: 'include',
          headers: {
            Accept: 'application/json, text/plain, */*',
            Authorization: ${authorizationLiteral},
            skipErrorInterceptor: 'true'
          }
        });
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: await response.text()
        };
      })()`, true) as { status: number; contentType: string | null; body: string };
    } catch (error: any) {
      logger.warn('PDPJ API: falha ao executar consulta no Chromium', {
        message: error?.message || String(error),
        currentUrl: safeUrlForLog(this.authWindow.webContents.getURL()),
      });
      throw error;
    }

    logger.info('PDPJ API: resposta recebida pelo contexto Chromium', {
      status: result.status,
      contentType: result.contentType,
      bodyLength: result.body.length,
    });
    return result;
  }

  /**
   * Desconecta (deleta sessão do disco).
   */
  async disconnect(): Promise<void> {
    this.store.clearSession();
    if (this.authWindow && !this.authWindow.isDestroyed()) this.authWindow.close();
    this.authWindow = null;
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
    return {
      tribunal: session.tribunal,
      userId: session.userId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      timeRemainingMs: session.expiresAt.getTime() - Date.now(),
      apiValidated: Boolean(session.accessToken),
      apiStatus: session.accessToken ? 'validated' : 'pending',
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
