/**
 * MeuJudi Sync — Status Reporter (Heartbeat)
 *
 * Envia um "estou vivo" pro servidor a cada 5 minutos.
 * O servidor usa esse heartbeat pra saber se o CS está online.
 * Se o CS não enviar heartbeat por >10 min, o Web mostra aviso.
 */

import { app } from 'electron';
import { MEUJUDI_WEB_URL, INTERVALS } from '../shared/constants';
import { logger, recordDiagnosticEvent } from './logger';
import { Pairing } from './pairing';
import type { ConnectionStatus } from '../shared/types';

export type { ConnectionStatus };

const TIMEOUT_MS = 10_000;

export interface HeartbeatPayload {
  status: 'online' | 'error';
  lastActivity: string | null;
  pendingTasks: number;
  version: string;
}

export class StatusReporter {
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivity: string | null = null;
  private pendingTasks = 0;
  private running = false;
  private lastHeartbeatAt: string | null = null;
  private lastError: string | null = null;
  private revoked = false;

  constructor(private readonly pairing: Pairing) {}

  /**
   * Status de conexão atual, pra exibir na Home sem precisar de outra
   * consulta ao servidor — reflete o resultado do último heartbeat.
   */
  getConnectionStatus(): ConnectionStatus {
    return {
      paired: this.pairing.isPaired(),
      online: this.lastError === null && this.lastHeartbeatAt !== null,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastError: this.lastError,
      revoked: this.revoked,
    };
  }

  /**
   * Inicia o heartbeat periódico.
   * Chamado pelo Scheduler quando o CS inicia.
   */
  start(): void {
    if (this.timer) return;

    // Envia primeiro heartbeat imediatamente (se tiver pareado)
    this.sendHeartbeat().catch((err) =>
      logger.warn('[StatusReporter] Primeiro heartbeat falhou:', err.message),
    );

    // Agenda heartbeat periódico
    this.timer = setInterval(() => {
      this.sendHeartbeat().catch((err) =>
        logger.warn('[StatusReporter] Heartbeat falhou:', err.message),
      );
    }, INTERVALS.heartbeat);

    logger.info('[StatusReporter] Heartbeat agendado:', INTERVALS.heartbeat);
  }

  /**
   * Para o heartbeat periódico.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[StatusReporter] Heartbeat parado');
  }

  /**
   * Envia heartbeat imediato (usado após tarefa concluir).
   */
  async reportNow(): Promise<void> {
    await this.sendHeartbeat();
  }

  /**
   * Registra a última atividade realizada pelo CS.
   * Ex: "mural_push", "mural_request", "oab_validation".
   */
  setLastActivity(activity: string): void {
    this.lastActivity = activity;
  }

  /**
   * Retorna a última atividade registrada.
   */
  getLastActivity(): string | null {
    return this.lastActivity;
  }

  setPendingTasks(count: number): void {
    this.pendingTasks = Math.max(0, Math.floor(count));
  }

  /**
   * Envia heartbeat pro servidor.
   */
  private async sendHeartbeat(): Promise<void> {
    if (this.running) return; // evita heartbeat concorrente
    this.running = true;

    const token = this.pairing.getDeviceToken();
    if (!token) {
      this.running = false;
      return; // CS não está pareado, não envia heartbeat
    }

    const startedAt = Date.now();
    const payload: HeartbeatPayload = {
      status: 'online',
      lastActivity: this.lastActivity,
      pendingTasks: 0, // será integrado com TaskQueue na Fase 3
      version: app.getVersion(),
    };
    payload.pendingTasks = this.pendingTasks;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.status === 401) {
        // Device token revogado pelo escritório (Configurações > MeuJudi Sync)
        // ou expirado — não adianta continuar tentando, o CS precisa parear
        // de novo. Ver Fase 2 do doc 23.
        this.revoked = true;
        this.lastError = 'Pareamento revogado';
        await this.pairing.unpair();
        logger.warn('[StatusReporter] Device token revogado — pareamento removido localmente');
        recordDiagnosticEvent('cs_device_revoked', 'warning', 'Device token revogado pelo servidor');
        return;
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const durationMs = Date.now() - startedAt;
      this.lastHeartbeatAt = new Date().toISOString();
      this.lastError = null;
      this.revoked = false;

      const body = await response.json().catch(() => null) as { realtime_token?: string } | null;
      if (body?.realtime_token) this.pairing.setRealtimeToken(body.realtime_token);

      logger.debug(`[StatusReporter] Heartbeat enviado (${durationMs}ms)`);
      recordDiagnosticEvent('cs_heartbeat_sent', 'success', `Heartbeat OK`, { lastActivity: this.lastActivity }, durationMs);
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      this.lastError = message;

      if (err instanceof Error && err.name === 'AbortError') {
        logger.warn(`[StatusReporter] Heartbeat timeout (${TIMEOUT_MS}ms)`);
        recordDiagnosticEvent('cs_heartbeat_timeout', 'warning', `Heartbeat timeout`, undefined, durationMs);
      } else {
        logger.warn(`[StatusReporter] Heartbeat falhou: ${message}`);
        recordDiagnosticEvent('cs_heartbeat_failed', 'warning', message, undefined, durationMs);
      }
    } finally {
      this.running = false;
    }
  }
}
