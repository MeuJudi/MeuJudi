/**
 * MeuJudi Sync — worker unificado da fila persistente.
 *
 * Reserva tarefas de sync_tasks (via TaskQueueClient), executa através de
 * handlers registrados por fonte+tipo, renova o lease durante a execução
 * e reporta o resultado. PDPJ (Fase 6) e Mural (Fase 7, completa — inclui
 * push/sweep/histórico) estão plugados. DataJud fica só no Web (decisão
 * do Caio, 29/07/2026) — o slot de concorrência continua reservado no
 * tipo por generalidade, mas nenhum handler é registrado pra ele.
 *
 * "Sincronizar agora" (Home) dispara um ciclo imediato via syncNow() —
 * é a mesma execução que o poll periódico faria, só fora do intervalo.
 */

import { randomUUID } from 'node:crypto';
import { logger, recordDiagnosticEvent } from './logger';
import type { TaskQueueClient } from './task-queue-client';
import type { StatusReporter } from './status-reporter';
import type { SyncTask, SyncTaskSource, SyncTaskFinalStatus, UnifiedSyncProgress } from '../shared/types';

export interface TaskHandlerContext {
  heartbeat: (cursor?: unknown, counters?: Record<string, number>) => Promise<void>;
}

export interface TaskHandlerResult {
  status: SyncTaskFinalStatus;
  cursor?: unknown;
  counters?: Record<string, number>;
  errorCode?: string;
  errorMessage?: string;
}

export type TaskHandler = (task: SyncTask, ctx: TaskHandlerContext) => Promise<TaskHandlerResult>;

const SOURCE_CONCURRENCY: Record<SyncTaskSource, number> = { datajud: 2, mural: 1, pdpj: 2 };
const HEARTBEAT_INTERVAL_MS = 4 * 60_000; // menor que o lease de 10min do servidor
const POLL_INTERVAL_MS = 30_000;

export class SyncWorker {
  private readonly handlers = new Map<string, TaskHandler>();
  private readonly running: Record<SyncTaskSource, Set<string>> = { datajud: new Set(), mural: new Set(), pdpj: new Set() };
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private currentRun: UnifiedSyncProgress | null = null;
  private lastRun: UnifiedSyncProgress | null = null;
  private readonly cancelledTaskIds = new Set<string>();
  private ticking = false;

  constructor(private readonly client: TaskQueueClient, private readonly statusReporter?: StatusReporter) {}

  /** Registra o executor de um tipo de tarefa. */
  registerHandler(source: SyncTaskSource, type: string, handler: TaskHandler): void {
    this.handlers.set(`${source}:${type}`, handler);
  }

  start(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.tick(), POLL_INTERVAL_MS);
    logger.info(`[SyncWorker] Poll agendado a cada ${POLL_INTERVAL_MS}ms`);
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** "Sincronizar agora" — dispara um ciclo imediato, fora do intervalo normal. */
  async syncNow(): Promise<UnifiedSyncProgress> {
    return this.tick();
  }

  getCurrentProgress(): UnifiedSyncProgress | null {
    return this.currentRun;
  }

  getLastProgress(): UnifiedSyncProgress | null {
    return this.lastRun;
  }

  /** Sinaliza cancelamento — a tarefa é fechada como 'cancelled' assim que o worker checar. */
  cancelTask(taskId: string): void {
    this.cancelledTaskIds.add(taskId);
  }

  private async tick(): Promise<UnifiedSyncProgress> {
    if (this.ticking) return this.currentRun ?? this.lastRun ?? this.newProgress();
    this.ticking = true;

    const run = this.newProgress();
    this.currentRun = run;

    try {
      if (this.handlers.size === 0) {
        // Nenhuma fonte plugada ainda (Fase 5/6/7) — não há o que reservar.
        logger.debug('[SyncWorker] Nenhum handler registrado, ciclo pulado');
        return run;
      }

      await Promise.all(
        (Object.keys(SOURCE_CONCURRENCY) as SyncTaskSource[]).map((source) => this.pollSource(source, run)),
      );
      return run;
    } finally {
      run.finishedAt = new Date().toISOString();
      this.lastRun = run;
      this.currentRun = null;
      this.ticking = false;
    }
  }

  private async pollSource(source: SyncTaskSource, run: UnifiedSyncProgress): Promise<void> {
    const slots = SOURCE_CONCURRENCY[source] - this.running[source].size;
    if (slots <= 0) return;

    let tasks: SyncTask[];
    try {
      tasks = await this.client.claim(slots, [source]);
    } catch (err: any) {
      logger.warn(`[SyncWorker] Falha ao reservar tarefas de ${source}:`, err.message);
      return;
    }

    await Promise.all(tasks.map((task) => this.runTask(task, run)));
  }

  private async runTask(task: SyncTask, run: UnifiedSyncProgress): Promise<void> {
    const handler = this.handlers.get(`${task.source}:${task.type}`);
    if (!handler) {
      await this.client
        .complete(task.id, 'failed', { errorCode: 'sem_handler', errorMessage: `Nenhum executor registrado para ${task.source}:${task.type}` })
        .catch(() => undefined);
      return;
    }

    this.running[task.source].add(task.id);
    run.tasksTotal += 1;
    run.bySource[task.source].total += 1;
    this.reportPendingCount();
    this.statusReporter?.setLastActivity(`${task.source}:${task.type}`);

    // task.id funciona como correlation id — todo log/evento desta execução
    // carrega ele, então dá pra rastrear uma tarefa específica em Logs
    // mesmo sem contexto nenhum além do ID mostrado na Fila (Fase 9).
    const correlationId = task.id;
    logger.info(`[SyncWorker] tarefa iniciada: ${task.source}:${task.type}`, { taskId: correlationId, attempt: task.attempt });

    const heartbeatTimer = setInterval(() => {
      this.client.heartbeat(task.id).catch((err) => logger.warn('[SyncWorker] heartbeat falhou:', err.message, { taskId: correlationId }));
    }, HEARTBEAT_INTERVAL_MS);

    const startedAt = Date.now();
    try {
      if (this.cancelledTaskIds.has(task.id)) {
        await this.client.complete(task.id, 'cancelled');
        this.cancelledTaskIds.delete(task.id);
        run.tasksCompleted += 1;
        run.bySource[task.source].done += 1;
        return;
      }

      const result = await handler(task, {
        heartbeat: (cursor, counters) => this.client.heartbeat(task.id, cursor, counters),
      });
      await this.client.complete(task.id, result.status, {
        cursor: result.cursor,
        counters: result.counters,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
      });

      if (result.status === 'completed' || result.status === 'completed_with_warnings') run.tasksCompleted += 1;
      else if (result.status === 'failed' || result.status === 'cancelled') run.tasksFailed += 1;
      else run.tasksPaused += 1;
      run.bySource[task.source].done += 1;

      recordDiagnosticEvent(
        'sync_task_finished',
        result.status === 'failed' ? 'error' : 'success',
        `${task.source}:${task.type} -> ${result.status}`,
        { taskId: task.id },
        Date.now() - startedAt,
      );
      logger.info(`[SyncWorker] tarefa concluída: ${task.source}:${task.type} -> ${result.status} (${Date.now() - startedAt}ms)`, { taskId: correlationId });
    } catch (err: any) {
      run.tasksFailed += 1;
      run.bySource[task.source].done += 1;
      await this.client
        .complete(task.id, 'failed', { errorCode: 'excecao_worker', errorMessage: String(err.message ?? err).slice(0, 500) })
        .catch(() => undefined);
      recordDiagnosticEvent('sync_task_finished', 'error', `${task.source}:${task.type} -> excecao`, { taskId: task.id, message: err.message }, Date.now() - startedAt);
      logger.error(`[SyncWorker] tarefa falhou: ${task.source}:${task.type} — ${err.message}`, { taskId: correlationId });
    } finally {
      clearInterval(heartbeatTimer);
      this.running[task.source].delete(task.id);
      this.reportPendingCount();
      await this.statusReporter?.reportNow().catch((err) => logger.warn('[SyncWorker] heartbeat pós-tarefa falhou:', err.message));
    }
  }

  private reportPendingCount(): void {
    const total = Object.values(this.running).reduce((sum, set) => sum + set.size, 0);
    this.statusReporter?.setPendingTasks(total);
  }

  private newProgress(): UnifiedSyncProgress {
    return {
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      tasksTotal: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tasksPaused: 0,
      bySource: {
        datajud: { total: 0, done: 0 },
        mural: { total: 0, done: 0 },
        pdpj: { total: 0, done: 0 },
      },
    };
  }
}
