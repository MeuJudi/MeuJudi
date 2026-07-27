import Store from 'electron-store';
import { randomUUID } from 'node:crypto';
import { logger } from './logger';

export type TaskType = 'mural_request_poll' | 'mural_push' | 'mural_sweep' | 'mural_historical';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: TaskType;
  priority: number;
  status: TaskStatus;
  retryCount: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt?: string;
  lastError?: string;
}

type QueueStore = { tasks: Task[] };
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];
const CLEANUP_AFTER_MS = 24 * 60 * 60 * 1000;

export class TaskQueue {
  private readonly store = new Store<QueueStore>({ name: 'cs-task-queue', defaults: { tasks: [] } });

  constructor() {
    // Uma tarefa interrompida pelo fechamento do CS deve ser retomada,
    // nunca permanecer bloqueada indefinidamente em estado running.
    const recovered = this.store.get('tasks').map((task) => task.status === 'running'
      ? { ...task, status: 'pending' as const, startedAt: undefined, nextRunAt: new Date().toISOString() }
      : task);
    this.store.set('tasks', recovered);
  }

  add(input: Omit<Task, 'id' | 'status' | 'retryCount' | 'createdAt'>): Task {
    const task: Task = { ...input, id: randomUUID(), status: 'pending', retryCount: 0, createdAt: new Date().toISOString() };
    this.store.set('tasks', [...this.store.get('tasks'), task]);
    return task;
  }

  getNext(now = Date.now()): Task | null {
    return this.store.get('tasks')
      .filter((task) => task.status === 'pending' && (!task.nextRunAt || new Date(task.nextRunAt).getTime() <= now))
      .sort((a, b) => a.priority - b.priority || a.createdAt.localeCompare(b.createdAt))[0] ?? null;
  }

  hasOpen(type: TaskType): boolean {
    return this.store.get('tasks').some((task) => task.type === type && (task.status === 'pending' || task.status === 'running'));
  }

  markRunning(taskId: string): void {
    this.update(taskId, { status: 'running', startedAt: new Date().toISOString() });
  }

  markCompleted(taskId: string): void {
    this.update(taskId, { status: 'completed', completedAt: new Date().toISOString(), nextRunAt: undefined });
  }

  markFailed(taskId: string, error: string): void {
    const task = this.store.get('tasks').find((item) => item.id === taskId);
    if (!task) return;
    const retryCount = task.retryCount + 1;
    const message = error.slice(0, 500);
    if (retryCount <= MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      this.update(taskId, { status: 'pending', retryCount, lastError: message, nextRunAt: new Date(Date.now() + delay).toISOString() });
      logger.warn(`Tarefa ${task.type} falhou; nova tentativa ${retryCount}/${MAX_RETRIES} em ${delay}ms.`);
      return;
    }
    this.update(taskId, { status: 'failed', retryCount, lastError: message, completedAt: new Date().toISOString() });
    logger.error(`Tarefa ${task.type} esgotou as tentativas:`, message);
  }

  getPendingCount(): number { return this.store.get('tasks').filter((task) => task.status === 'pending').length; }
  getRunningCount(): number { return this.store.get('tasks').filter((task) => task.status === 'running').length; }

  cleanup(): void {
    const cutoff = Date.now() - CLEANUP_AFTER_MS;
    this.store.set('tasks', this.store.get('tasks').filter((task) => {
      const finishedAt = task.completedAt ? new Date(task.completedAt).getTime() : null;
      return !finishedAt || finishedAt > cutoff;
    }));
  }

  private update(taskId: string, changes: Partial<Task>): void {
    this.store.set('tasks', this.store.get('tasks').map((task) => task.id === taskId ? { ...task, ...changes } : task));
  }
}
