/**
 * MeuJudi Sync — cliente da fila persistente (Supabase, via Web).
 *
 * Reserva (claim), renova lease (heartbeat), conclui e cria tarefas da fila
 * unificada `sync_tasks`. Usado pelo SyncWorker (Fase 4) e pelos handlers
 * de PDPJ (Fase 6). Ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md.
 */

import { MEUJUDI_WEB_URL } from '../shared/constants';
import { logger } from './logger';
import type { Pairing } from './pairing';
import type { SyncTask, SyncTaskFinalStatus, SyncTaskSource, TaskBatch } from '../shared/types';

const TIMEOUT_MS = 15_000;

export class TaskQueueClient {
  constructor(private readonly pairing: Pairing) {}

  private async request<T>(path: string, body?: Record<string, unknown>, method: 'GET' | 'POST' = 'POST'): Promise<T> {
    const token = this.pairing.getDeviceToken();
    if (!token) throw new Error('CS não está pareado — não é possível falar com a fila.');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${MEUJUDI_WEB_URL}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error((data?.error as string) || `HTTP ${response.status}`);
      return data as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Lista as tarefas recentes do tenant pareado (tela de fila). Só leitura, não reserva nada. */
  async list(): Promise<SyncTask[]> {
    const data = await this.request<{ tasks: SyncTask[] }>('/api/cs/tasks', undefined, 'GET');
    return data.tasks;
  }

  /** Resumo agregado por lote (tela de fila, visão agrupada). */
  async listBatches(): Promise<TaskBatch[]> {
    const data = await this.request<{ batches: TaskBatch[] }>('/api/cs/tasks/batches', undefined, 'GET');
    return data.batches;
  }

  /** Tarefas individuais de um lote específico (expandir um card na tela de fila). */
  async listBatchTasks(batchKey: string): Promise<SyncTask[]> {
    const data = await this.request<{ tasks: SyncTask[] }>(`/api/cs/tasks?batch=${encodeURIComponent(batchKey)}`, undefined, 'GET');
    return data.tasks;
  }

  /**
   * Cria uma nova tarefa na fila (ex.: disparo manual de sincronização de
   * uma OAB, ou uma tarefa-filha de CNJ descoberta durante essa varredura).
   * `idempotencyKey` deve ser única por tenant — criar de novo com a mesma
   * chave é ignorado silenciosamente pelo servidor (dedup natural).
   */
  async create(input: {
    source: SyncTaskSource;
    type: string;
    idempotencyKey: string;
    priority?: number;
    cnj?: string;
    parentTaskId?: string;
    cursor?: unknown;
  }): Promise<{ created: boolean; taskId?: string }> {
    const data = await this.request<{ ok: boolean; created: boolean; taskId?: string }>('/api/cs/tasks/create', input);
    return { created: data.created, taskId: data.taskId };
  }

  /**
   * Dispara o job de sincronização do DataJud pro tenant pareado — DataJud
   * não roda pela fila unificada (decisão 29/07/2026: só via Web), então
   * isso só cria a linha em `datajud_sync_jobs`; quem processa é o cron
   * `process-datajud-sync` do lado do Web, não o CS. Usado pelo "Sincronizar
   * agora" (Home/tray) pra cobrir os 3 motores de extração num clique só
   * (achado 04/08/2026: antes só disparava Mural/PDPJ pelo CS).
   */
  async triggerDataJudSync(): Promise<{ jobId: string; resumed: boolean }> {
    const data = await this.request<{ ok: boolean; jobId: string; resumed: boolean }>('/api/cs/sync/datajud/trigger');
    return { jobId: data.jobId, resumed: data.resumed };
  }

  /**
   * Conta quantas tarefas do tenant estão em `pending` agora no servidor —
   * diferente do que o worker reporta localmente (tarefas que ELE está
   * processando neste momento). Usado pro alerta de backlog crescendo
   * mesmo com sessão saudável (ver `pdpj-auth.ts::maybeCheckPendingBacklog`,
   * docs/roadmap/28-pdpj-auth-robustez.md item 3.6).
   */
  async getPendingCount(source?: SyncTaskSource): Promise<number> {
    const query = source ? `?source=${encodeURIComponent(source)}` : '';
    const data = await this.request<{ pendingCount: number }>(`/api/cs/tasks/pending-count${query}`, undefined, 'GET');
    return data.pendingCount;
  }

  /** Reserva até `limit` tarefas pendentes (ou com lease expirado). */
  async claim(limit = 5, sources?: Array<'datajud' | 'mural' | 'pdpj'>): Promise<SyncTask[]> {
    const data = await this.request<{ tasks: SyncTask[] }>('/api/cs/tasks/claim', { limit, sources });
    if (data.tasks.length) logger.debug(`[TaskQueueClient] ${data.tasks.length} tarefa(s) reservada(s)`);
    return data.tasks;
  }

  /** Renova o lease de uma tarefa em execução, opcionalmente atualizando o cursor/contadores. */
  async heartbeat(taskId: string, cursor?: unknown, counters?: Record<string, number>): Promise<void> {
    await this.request(`/api/cs/tasks/${taskId}/heartbeat`, { cursor, counters });
  }

  /** Fecha ou pausa uma tarefa reservada por este device. */
  async complete(
    taskId: string,
    status: SyncTaskFinalStatus,
    options?: { cursor?: unknown; counters?: Record<string, number>; errorCode?: string; errorMessage?: string },
  ): Promise<void> {
    await this.request(`/api/cs/tasks/${taskId}/complete`, { status, ...options });
  }
}
