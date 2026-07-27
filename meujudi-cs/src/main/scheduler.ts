import cron, { type ScheduledTask } from 'node-cron';
import { logger } from './logger';
import { MuralPush } from './mural-push';
import { MuralSync } from './mural-sync';
import { Pairing } from './pairing';
import { StatusReporter } from './status-reporter';
import { TaskQueue, type Task, type TaskType } from './task-queue';

export interface SyncResult {
  processos: number;
  pecas: number;
  durationMs: number;
  mural?: { oabs: number; recebidas: number; novas: number; puladas: number; erros: number } | null;
}

const TASK_PRIORITIES: Record<TaskType, number> = {
  mural_request_poll: 1,
  mural_push: 3,
  mural_sweep: 4,
  mural_historical: 5,
};

export class Scheduler {
  private readonly queue = new TaskQueue();
  private readonly muralPush: MuralPush;
  private readonly jobs: ScheduledTask[] = [];
  private workerTimer: NodeJS.Timeout | null = null;
  private running = false;
  private activeJob = false;

  constructor(
    private readonly pairing = new Pairing(),
    private readonly muralSync = new MuralSync(pairing),
    private readonly statusReporter?: StatusReporter,
  ) {
    this.muralPush = new MuralPush(pairing);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.queue.cleanup();

    this.jobs.push(
      cron.schedule('*/5 * * * *', () => this.enqueue('mural_request_poll')),
      cron.schedule('*/30 * * * *', () => this.enqueue('mural_push')),
      cron.schedule('0 3 * * *', () => this.enqueue('mural_sweep')),
      cron.schedule('0 3 * * 0', () => this.enqueue('mural_historical')),
    );
    this.workerTimer = setInterval(() => { void this.processNextTask(); }, 10_000);

    // Recupera tarefas pendentes do disco e atende solicitacoes novas rapidamente.
    this.enqueue('mural_request_poll');
    void this.processNextTask();
    logger.info('Scheduler automatico iniciado com fila persistente.');
  }

  stop(): void {
    for (const job of this.jobs) job.stop();
    this.jobs.length = 0;
    if (this.workerTimer) clearInterval(this.workerTimer);
    this.workerTimer = null;
    this.running = false;
    logger.info('Scheduler automatico parado.');
  }

  isRunning(): boolean { return this.running; }

  async tickNow(): Promise<SyncResult> {
    const start = Date.now();
    logger.info('Sync manual iniciado');
    const mural = await this.muralSync.tick();
    return { processos: 0, pecas: 0, mural, durationMs: Date.now() - start };
  }

  private enqueue(type: TaskType): void {
    if (!this.running || this.queue.hasOpen(type)) return;
    this.queue.add({ type, priority: TASK_PRIORITIES[type] });
    this.updateQueueStatus();
    logger.info(`Scheduler: tarefa ${type} adicionada à fila.`);
  }

  private async processNextTask(): Promise<void> {
    if (!this.running || this.activeJob) return;
    const task = this.queue.getNext();
    if (!task) return;
    if (!this.pairing.isPaired()) return;

    this.activeJob = true;
    this.queue.markRunning(task.id);
    this.updateQueueStatus();
    this.statusReporter?.setLastActivity(task.type);
    const startedAt = Date.now();
    try {
      await this.execute(task);
      this.queue.markCompleted(task.id);
      logger.info(`Scheduler: ${task.type} concluida em ${Date.now() - startedAt}ms.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.queue.markFailed(task.id, message);
      logger.error(`Scheduler: ${task.type} falhou:`, message);
    } finally {
      this.activeJob = false;
      this.updateQueueStatus();
      await this.statusReporter?.reportNow().catch((error) => logger.warn('Heartbeat pos-tarefa falhou:', error));
    }
  }

  private async execute(task: Task): Promise<unknown> {
    switch (task.type) {
      case 'mural_request_poll': return this.muralSync.processPendingRequests();
      case 'mural_push': return this.muralPush.run();
      case 'mural_sweep': return this.muralSync.tick();
      case 'mural_historical': return this.muralSync.syncHistorical();
    }
  }

  private updateQueueStatus(): void {
    this.statusReporter?.setPendingTasks(this.queue.getPendingCount() + this.queue.getRunningCount());
  }
}
