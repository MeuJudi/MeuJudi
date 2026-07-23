/**
 * MeuJudi CS — Módulo ConfirmADV
 *
 * Responsabilidade: abrir a página oficial do ConfirmADV dentro de uma
 * BrowserWindow do CS, deixar o advogado resolver o reCAPTCHA e digitar o
 * código manualmente, e reportar SOMENTE o resultado sanitizado pro Web.
 *
 * Restrições de segurança (ver docs/roadmap/validacao-oab-confirmadv-cs.md):
 * - nunca armazenar cookies, tokens de reCAPTCHA, código de e-mail ou
 *   sessão do ConfirmADV;
 * - a interação com o reCAPTCHA acontece na página oficial aberta pelo
 *   advogado — o CS apenas observa o progresso via URL;
 * - o Web é a fonte da verdade do estado da validação; o CS reporta
 *   eventos e resultado final.
 *
 * A janela usa uma partition isolada (sem persistência de cookies) e é
 * limpa ao final, mesmo em caso de erro ou cancelamento.
 */

import { BrowserWindow, session as electronSession, Notification } from 'electron';
import { logger, recordDiagnosticEvent } from './logger';
import { MEUJUDI_WEB_URL } from '../shared/constants';
import { inferEventFromUrl, extractRequestIdFromUrl, CONFIRMADV_BASE } from './confirmadv-helpers';
import type { Pairing } from './pairing';
import type { ConfirmADVValidation, ConfirmADVStatus } from '../shared/types';

const POLLING_INTERVAL_MS = 15_000;
const VALIDATION_TIMEOUT_MS = 15 * 60_000; // 15 min da abertura da janela
const INACTIVITY_TIMEOUT_MS = 5 * 60_000; // 5 min sem navegação
// C4 — auditoria: a partition era nomeada por validationId e nunca era
// removida, só limpa. Após centenas de validações, o Electron acumulava
// partitions vazias. Agora usamos uma partition fixa e limpamos no
// início de cada validação.
const PARTITION = 'persist:confirmadv-current';

const REPORTABLE_EVENTS = new Set([
  'cs_received',
  'browser_opened',
  'captcha_completed',
  'request_created',
  'code_pending',
  'verified',
  'rejected',
  'expired',
  'failed',
  'cancelled',
]);

export type { ConfirmADVEventHint } from './confirmadv-helpers';

type ReportEvent =
  | 'cs_received'
  | 'browser_opened'
  | 'captcha_completed'
  | 'request_created'
  | 'code_pending'
  | 'verified'
  | 'rejected'
  | 'expired'
  | 'failed'
  | 'cancelled';

interface ReportPayload {
  event_type: ReportEvent;
  message?: string;
  external_request_id?: string;
  result?: {
    returned_name?: string;
    returned_status?: string;
    returned_email?: string;
    is_validation?: boolean;
    expires_at?: string;
  };
}

export class ConfirmADVService {
  // S3: emite evento de lifecycle com timestamp e contexto. Cada etapa
  // importante (abertura de janela, navegação, terminal) gera uma
  // entrada na tabela diagnostic_events do Supabase, permitindo
  // reconstruir a sequência de uma validação que falhou.
  private logLifecycle(stage: string, status: 'started' | 'success' | 'warning' | 'error' | 'info' = 'info', extra: Record<string, unknown> = {}): void {
    const startedAt = this.validationStartedAt ?? Date.now();
    const durationMs = Date.now() - startedAt;
    recordDiagnosticEvent('oab_validation_lifecycle', status, `Etapa ${stage}`, {
      validationId: this.currentValidation?.id,
      stage,
      durationMs,
      ...extra,
    });
  }

  private currentWindow: BrowserWindow | null = null;
  private currentValidation: ConfirmADVValidation | null = null;
  private currentPartition: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private validationTimeout: NodeJS.Timeout | null = null;
  private inactivityTimeout: NodeJS.Timeout | null = null;
  private busy = false;
  // C1: distingue fechamento intencional (verified/expired/failed) do
  // fechamento pelo usuário. Sem essa flag, o handler `close` da
  // BrowserWindow nunca disparava o report `cancelled` porque
  // currentValidation já tinha sido zerado por `closeWindow`.
  private intentionalClose = false;
  // S3: timestamp em que a validação atual começou, para medir
  // duração de cada etapa no log estruturado de lifecycle.
  private validationStartedAt: number | null = null;

  constructor(private readonly pairing: Pairing) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error('ConfirmADV poll error:', err));
    }, POLLING_INTERVAL_MS);
    this.tick().catch((err) => logger.error('ConfirmADV initial poll error:', err));
    logger.info('ConfirmADV polling iniciado a cada', POLLING_INTERVAL_MS, 'ms');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.closeWindow('cancelled');
  }

  /**
   * Chamado pela home do renderer pra abrir a janela de validação que
   * ainda está em andamento. Se não houver nenhuma, retorna null.
   */
  async openActive(): Promise<ConfirmADVValidation | null> {
    if (this.currentValidation) {
      this.showWindow();
      return this.currentValidation;
    }
    return null;
  }

  /**
   * Botão manual: força uma consulta imediata no Web, e se houver
   * solicitação pendente, abre a janela do ConfirmADV. Pode ser
   * chamado várias vezes — cada chamada é independente. Após uma
   * validação terminar (verified/expired/cancelled/failed), o CS
   * fica pronto para a próxima tentativa sem precisar reiniciar.
   */
  async checkAndOpen(): Promise<
    { status: 'opened'; validation: ConfirmADVValidation }
    | { status: 'already_open'; validation: ConfirmADVValidation }
    | { status: 'no_pending' }
    | { status: 'not_paired' }
    | { status: 'error'; message: string }
  > {
    if (this.currentValidation) {
      this.showWindow();
      return { status: 'already_open', validation: this.currentValidation };
    }
    if (!this.pairing.getDeviceToken()) {
      return { status: 'not_paired' };
    }

    try {
      const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/oab-validations`, {
        headers: { Authorization: `Bearer ${this.pairing.getDeviceToken()}` },
      });
      const data = (await response.json()) as { validation?: ConfirmADVValidation | null; error?: string };
      if (!response.ok) {
        return { status: 'error', message: data.error ?? `HTTP ${response.status}` };
      }
      if (!data.validation) {
        return { status: 'no_pending' };
      }
      // Dispara o mesmo handler de polling: abre a janela e reporta cs_received.
      // O `await` permite devolver o resultado da abertura.
      this.busy = false; // libera o busy para o handlePending rodar
      this.currentValidation = data.validation;
      this.validationStartedAt = Date.now();
      this.logLifecycle('cs_received_manual', 'started', { oab: `${data.validation.oab_number}/${data.validation.oab_uf}` });
      await this.reportEvent(data.validation.id, 'cs_received');
      this.openWindow(data.validation);
      return { status: 'opened', validation: data.validation };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: 'error', message };
    }
  }

  getCurrent(): ConfirmADVValidation | null {
    return this.currentValidation;
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    if (this.currentValidation) return; // já existe uma validação em andamento
    const token = this.pairing.getDeviceToken();
    if (!token) return;

    this.busy = true;
    try {
      const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/oab-validations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json()) as { validation?: ConfirmADVValidation | null; error?: string };
      if (!response.ok) {
        logger.warn('ConfirmADV poll HTTP', response.status, data.error);
        return;
      }
      if (!data.validation) return;
      this.busy = false;
      this.handlePending(data.validation);
    } catch (error) {
      logger.warn('ConfirmADV poll falhou:', (error as Error).message);
    } finally {
      this.busy = false;
    }
  }

  private async handlePending(validation: ConfirmADVValidation): Promise<void> {
    this.currentValidation = validation;
    this.validationStartedAt = Date.now();
    this.logLifecycle('cs_received', 'started', { oab: `${validation.oab_number}/${validation.oab_uf}` });
    await this.reportEvent(validation.id, 'cs_received');
    this.openWindow(validation);
  }

  private openWindow(validation: ConfirmADVValidation): void {
    this.closeWindowSilently();
    // C4: partition fixa em vez de uma por validationId.
    // Cada validação começa com `clearStorageData` que apaga cookies,
    // localStorage, indexedDB etc. — efetivamente "uma partition nova"
    // sem o overhead de manter o objeto Electron Session pra sempre.
    this.currentPartition = PARTITION;

    // Garante que a partition começa limpa (sem cookies do ConfirmADV
    // de tentativas anteriores). O `await` não é estritamente necessário
    // porque a janela abre imediatamente, mas o clearStorageData é rápido
    // e queremos a partição limpa antes do loadURL.
    electronSession
      .fromPartition(PARTITION)
      .clearStorageData()
      .catch((err) => logger.warn('Falha ao limpar storage da partition:', err.message));

    const window = new BrowserWindow({
      width: 1100,
      height: 820,
      minWidth: 900,
      minHeight: 700,
      title: `ConfirmADV — ${validation.oab_number}/${validation.oab_uf}`,
      autoHideMenuBar: true,
      webPreferences: {
        partition: PARTITION,
        contextIsolation: true,
        nodeIntegration: false,
        // Desabilita qualquer preload — não queremos código do CS
        // rodando na página do ConfirmADV. Mantém a página 100% oficial.
        preload: undefined,
        sandbox: true,
      },
    });

    this.currentWindow = window;

    // Notifica o advogado que tem validação pendente
    new Notification({
      title: 'MeuJudi CS — Validar OAB',
      body: `Abra a janela para validar ${validation.oab_number}/${validation.oab_uf}. O reCAPTCHA e o código enviado ao e-mail profissional são resolvidos por você.`,
      silent: false,
    }).show();

    // W5/W6 — auditoria: nenhum handler async. Electron não espera
    // Promises em event listeners, então o reportEvent é sempre
    // fire-and-forget. O closeWindow é chamado diretamente, sem
    // setTimeout, para evitar recursão com o reportEvent (que pode
    // disparar closeWindow quando recebe status terminal do Web).

    // Eventos da janela
    window.webContents.on('did-finish-load', () => {
      this.resetInactivityTimeout(validation.id);
      this.reportEvent(validation.id, 'browser_opened').catch(() => undefined);
      this.logLifecycle('browser_opened', 'info');
    });

    window.webContents.on('did-navigate', (_event, url) => {
      this.resetInactivityTimeout(validation.id);
      const hint = inferEventFromUrl(url);
      if (!hint) return;
      const externalId = extractRequestIdFromUrl(url);
      this.reportEvent(validation.id, hint, { external_request_id: externalId }).catch(() => undefined);
      this.logLifecycle(`navigate_${hint}`, hint === 'verified' ? 'success' : 'info', { url, externalId });
      // Não chamamos closeWindow aqui: se o reportEvent receber status
      // terminal do Web (ex.: validada), ele já dispara o closeWindow
      // internamente. Antes havia um setTimeout que duplicava o close.
    });

    window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
      logger.warn('ConfirmADV load falhou:', errorCode, errorDescription, validatedURL);
      this.logLifecycle('load_failed', 'error', { errorCode, errorDescription, validatedURL });
      this.reportEvent(validation.id, 'failed', { message: `Falha ao carregar ConfirmADV (${errorCode}).` })
        .then((result) => {
          // Só fecha se o Web confirmou o status terminal — se o
          // reportEvent falhou, deixa a janela aberta para o usuário
          // tentar de novo manualmente.
          if (result.ok && result.status === 'erro') {
            this.closeWindow('failed');
          }
        })
        .catch(() => undefined);
    });

    window.on('close', () => {
      // C1: o handler NÃO é async porque o Electron não espera Promises
      // em event listeners. Se o usuário fechou (não fomos nós), reporta
      // 'cancelled' em fire-and-forget. O check `!intentionalClose` evita
      // disparar cancelled quando o próprio closeWindow iniciou o close.
      if (this.intentionalClose) return;
      if (this.currentValidation?.id !== validation.id) return;
      this.reportEvent(validation.id, 'cancelled').catch(() => undefined);
      this.logLifecycle('user_cancelled', 'warning');
    });

    window.on('closed', () => {
      if (this.currentWindow === window) this.currentWindow = null;
      this.clearTimers();
      // Limpa cookies/storage mesmo que o usuário só minimize+feche.
      if (this.currentPartition) {
        electronSession
          .fromPartition(this.currentPartition)
          .clearStorageData()
          .catch(() => undefined);
      }
    });

    // Timeout total da validação (15min)
    this.validationTimeout = setTimeout(() => {
      logger.warn('ConfirmADV validation timeout atingido para', validation.id);
      this.logLifecycle('validation_timeout', 'warning', { timeoutMs: VALIDATION_TIMEOUT_MS });
      this.reportEvent(validation.id, 'expired', { message: 'Tempo esgotado para concluir a verificacao.' })
        .catch(() => undefined);
      this.closeWindow('expired');
    }, VALIDATION_TIMEOUT_MS);

    // Carrega a página oficial
    window.loadURL(CONFIRMADV_BASE).catch((err) => {
      logger.error('Falha ao carregar ConfirmADV:', err);
    });
  }

  private resetInactivityTimeout(validationId: string): void {
    if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
    this.inactivityTimeout = setTimeout(() => {
      logger.warn('ConfirmADV inativo ha muito tempo para', validationId);
      this.logLifecycle('inactivity_timeout', 'warning', { inactivityMs: INACTIVITY_TIMEOUT_MS });
      this.reportEvent(validationId, 'expired', { message: 'Sem interação por muito tempo.' })
        .catch(() => undefined);
      this.closeWindow('expired');
    }, INACTIVITY_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.validationTimeout) clearTimeout(this.validationTimeout);
    if (this.inactivityTimeout) clearTimeout(this.inactivityTimeout);
    this.validationTimeout = null;
    this.inactivityTimeout = null;
  }

  private closeWindow(reason: 'cancelled' | 'verified' | 'expired' | 'failed'): void {
    // C1: marca que ESTE close foi iniciado por nós. O handler `close` da
    // BrowserWindow checa essa flag e não dispara `cancelled` duplicado.
    this.intentionalClose = true;
    try {
      if (this.currentWindow && !this.currentWindow.isDestroyed()) {
        // W6 (defesa em profundidade): remove o listener `close` antes
        // de fechar para garantir que NEM o handler de cancel roda
        // quando fechamos intencionalmente. O `intentionalClose` já
        // cobre, mas isto é redundância explícita.
        this.currentWindow.removeAllListeners('close');
        this.currentWindow.close();
      }
    } finally {
      // S3: log do terminal do lifecycle.
      this.logLifecycle(`closed_${reason}`, reason === 'verified' ? 'success' : 'warning');
      // Reseta mesmo se o close falhar — o estado precisa estar consistente
      // para o próximo tick do polling.
      this.currentWindow = null;
      this.currentValidation = null;
      this.currentPartition = null;
      this.validationStartedAt = null;
      this.clearTimers();
      this.intentionalClose = false;
      logger.info('ConfirmADV window fechada:', reason);
    }
  }

  private closeWindowSilently(): void {
    if (this.currentWindow && !this.currentWindow.isDestroyed()) {
      this.currentWindow.removeAllListeners('close');
      this.currentWindow.close();
    }
    this.currentWindow = null;
    this.clearTimers();
  }

  private showWindow(): void {
    if (!this.currentWindow) return;
    if (this.currentWindow.isMinimized()) this.currentWindow.restore();
    this.currentWindow.show();
    this.currentWindow.focus();
  }

  private async reportEvent(
    validationId: string,
    eventType: ReportEvent,
    extra: { message?: string; external_request_id?: string; result?: ReportPayload['result'] } = {},
  ): Promise<{ ok: boolean; status?: ConfirmADVStatus }> {
    if (!REPORTABLE_EVENTS.has(eventType)) return { ok: false };
    const token = this.pairing.getDeviceToken();
    if (!token) return { ok: false };
    const payload: ReportPayload = { event_type: eventType, ...extra };
    try {
      const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/oab-validations/${validationId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = (await response.json()) as { ok?: boolean; status?: ConfirmADVStatus; error?: string };
      if (!response.ok) {
        logger.warn('Falha ao reportar evento ConfirmADV', eventType, ':', response.status, data.error);
        return { ok: false };
      }
      // Se o Web marcou como terminal, podemos fechar a janela.
      if (data.status && ['validada', 'recusada', 'expirada', 'cancelada'].includes(data.status)) {
        const terminalReason = data.status === 'validada' ? 'verified' : data.status === 'recusada' ? 'failed' : data.status === 'expirada' ? 'expired' : 'cancelled';
        this.closeWindow(terminalReason);
      }
      return { ok: true, status: data.status };
    } catch (error) {
      logger.warn('Erro de rede ao reportar evento ConfirmADV:', (error as Error).message);
      return { ok: false };
    }
  }
}
