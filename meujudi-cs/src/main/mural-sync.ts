import Store from 'electron-store';
import { MEUJUDI_WEB_URL } from '../shared/constants';
import { decryptObject, encryptObject } from '../shared/crypto';
import { logger, recordDiagnosticEvent } from './logger';
import { MuralClient, type MuralComunicacao } from './mural-client';
import { Pairing } from './pairing';
import type { MuralProgressSnapshot, MuralRemoteRequest, MuralRequestProgress } from '../shared/types';

type Oab = { oab_number: string; oab_uf: string };
type SyncCounters = { oabs: number; recebidas: number; novas: number; puladas: number; erros: number };
export type HistoricalSyncResult = SyncCounters & { semanas: number; retomada: boolean };

type HistoricalCheckpoint = {
  planKey: string;
  taskIndex: number;
  counters: SyncCounters;
  startedAt: string;
  completedAt?: string;
  current?: { oab: string; uf: string; from: string; to: string; page: number; totalTasks: number };
};

type HistoricalStore = { payload: string | null };
type ProgressStore = { recent: MuralRequestProgress[] };

const HISTORICAL_MONTHS = 12;
const CHUNK_DAYS = 7;
const REQUEST_DELAY_MS = 350;
const MAX_PAGES_PER_CHUNK = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function emptyCounters(oabs = 0): SyncCounters {
  return { oabs, recebidas: 0, novas: 0, puladas: 0, erros: 0 };
}

function sumCounters(a: SyncCounters, b: SyncCounters): SyncCounters {
  return {
    oabs: a.oabs,
    recebidas: a.recebidas + b.recebidas,
    novas: a.novas + b.novas,
    puladas: a.puladas + b.puladas,
    erros: a.erros + b.erros,
  };
}

export class MuralSync {
  private readonly mural = new MuralClient();
  private readonly checkpointStore = new Store<HistoricalStore>({ name: 'cs-mural-history', defaults: { payload: null } });
  private readonly progressStore = new Store<ProgressStore>({ name: 'cs-mural-progress', defaults: { recent: [] } });
  private historicalRunning = false;
  private currentRequest: MuralRequestProgress | null = null;

  constructor(private readonly pairing: Pairing) {}

  /**
   * Progresso da consulta individual/periódica por OAB. Esse mecanismo
   * (processPendingRequests/processPendingRequest) foi migrado pra tarefa
   * `mural_request` do worker unificado na Fase 7 — `currentRequest` nunca
   * mais é escrito, então isso sempre volta vazio. Mantido só porque o
   * IPC `mural:progress` ainda existe e o painel do Mural ainda o lê;
   * ver a nota em MuralProgressPanel apontando pra "Fila de tarefas".
   */
  getProgress(): MuralProgressSnapshot {
    return {
      running: this.currentRequest?.status === 'processing',
      current: this.currentRequest,
      recent: this.progressStore.get('recent'),
    };
  }

  async getRemoteStatus(): Promise<MuralRemoteRequest[]> {
    const token = this.pairing.getDeviceToken();
    if (!token) return [];
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/mural-requests?mode=status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json() as { requests?: MuralRemoteRequest[]; error?: string };
    if (!response.ok) throw new Error(data.error || `Status das solicitações HTTP ${response.status}`);
    return data.requests ?? [];
  }

  isHistoricalRunning() {
    return this.historicalRunning;
  }

  getHistoricalCheckpoint() {
    const payload = this.checkpointStore.get('payload');
    if (!payload) return null;
    try { return decryptObject<HistoricalCheckpoint>(payload); }
    catch (error) { logger.warn('Checkpoint historico invalido, limpando:', error); this.checkpointStore.set('payload', null); return null; }
  }

  private setHistoricalCheckpoint(checkpoint: HistoricalCheckpoint) {
    this.checkpointStore.set('payload', encryptObject(checkpoint));
  }

  async tick(): Promise<SyncCounters | null> {
    const hoje = new Date();
    const inicio = addDays(hoje, -7);
    return this.syncWindow(inicio, hoje, 'cs_mural_sync');
  }

  /**
   * Importa os ultimos 12 meses em semanas, retomando o ultimo checkpoint.
   * `onProgress` é opcional — usado pela tarefa `mural_historical` do
   * worker unificado (Fase 7) pra espelhar o checkpoint local no
   * heartbeat da fila, só pra visibilidade (a retomada em si continua
   * local, via `cs-mural-history`).
   */
  async syncHistorical(onProgress?: (taskIndex: number, totalTasks: number, counters: SyncCounters) => void): Promise<HistoricalSyncResult | null> {
    if (this.historicalRunning) throw new Error('A importacao historica ja esta em andamento.');
    const token = this.pairing.getDeviceToken();
    if (!token) {
      recordDiagnosticEvent('cs_mural_history_skipped', 'skipped', 'CS ainda nao esta pareado');
      return null;
    }

    this.historicalRunning = true;
    const startedAt = Date.now();
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const oabs = await this.getOabs(headers);
      const hoje = new Date();
      const inicio = new Date(hoje);
      inicio.setUTCMonth(inicio.getUTCMonth() - HISTORICAL_MONTHS);
      // Comeca pelo periodo mais recente para que os dados aparecam logo no Web.
      const weeks = this.buildWindows(inicio, hoje).reverse();
      const tasks = oabs.flatMap((oab) => weeks.map((window) => ({ oab, window })));
      const planKey = JSON.stringify({ oabs, from: dateKey(inicio), to: dateKey(hoje), chunkDays: CHUNK_DAYS, order: 'recent-first-v2' });
      const saved = this.getHistoricalCheckpoint();
      const retomada = Boolean(saved && saved.planKey === planKey && saved.taskIndex < tasks.length);
      let taskIndex = retomada ? saved!.taskIndex : 0;
      let counters = retomada ? saved!.counters : emptyCounters(oabs.length);

      recordDiagnosticEvent('cs_mural_history_started', 'started', `Importacao historica de ${HISTORICAL_MONTHS} meses iniciada`, {
        oabs: oabs.length, semanas: weeks.length, tarefas: tasks.length, retomada,
      });

      while (taskIndex < tasks.length) {
        const task = tasks[taskIndex];
        this.setHistoricalCheckpoint({
          planKey, taskIndex, counters, startedAt: new Date(startedAt).toISOString(),
          current: { oab: task.oab.oab_number, uf: task.oab.oab_uf, from: dateKey(task.window.from), to: dateKey(task.window.to), page: 1, totalTasks: tasks.length },
        });
        const taskCounters = await this.syncOabWindow(headers, task.oab, task.window.from, task.window.to, (page) => {
          this.setHistoricalCheckpoint({
            planKey, taskIndex, counters, startedAt: new Date(startedAt).toISOString(),
            current: { oab: task.oab.oab_number, uf: task.oab.oab_uf, from: dateKey(task.window.from), to: dateKey(task.window.to), page, totalTasks: tasks.length },
          });
        });
        counters = sumCounters(counters, taskCounters);
        taskIndex += 1;
        this.setHistoricalCheckpoint({
          planKey, taskIndex, counters, startedAt: new Date(startedAt).toISOString(),
        });
        onProgress?.(taskIndex, tasks.length, counters);
      }

      const result = { ...counters, semanas: weeks.length, retomada };
      this.setHistoricalCheckpoint({
        planKey, taskIndex, counters, startedAt: new Date(startedAt).toISOString(), completedAt: new Date().toISOString(),
      });
      recordDiagnosticEvent('cs_mural_history_finished', result.erros ? 'warning' : 'success', `Importacao historica concluida: ${result.novas} novas`, result, Date.now() - startedAt);
      return result;
    } catch (error) {
      recordDiagnosticEvent('cs_mural_history_failed', 'error', error instanceof Error ? error.message : 'Falha na importacao historica', this.getHistoricalCheckpoint() ?? undefined, Date.now() - startedAt);
      throw error;
    } finally {
      this.historicalRunning = false;
    }
  }

  private async getOabs(headers: Record<string, string>): Promise<Oab[]> {
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/oabs`, { headers });
    const data = await response.json() as { oabs?: Oab[]; error?: string };
    if (!response.ok) throw new Error(data.error || `OABs HTTP ${response.status}`);
    return data.oabs ?? [];
  }

  private buildWindows(from: Date, to: Date) {
    const windows: Array<{ from: Date; to: Date }> = [];
    let cursor = new Date(from);
    while (cursor < to) {
      const end = addDays(cursor, CHUNK_DAYS - 1);
      windows.push({ from: new Date(cursor), to: end < to ? end : new Date(to) });
      cursor = addDays(end, 1);
    }
    return windows;
  }

  private async syncWindow(from: Date, to: Date, eventPrefix: string): Promise<SyncCounters | null> {
    const token = this.pairing.getDeviceToken();
    if (!token) {
      recordDiagnosticEvent(`${eventPrefix}_skipped`, 'skipped', 'CS ainda nao esta pareado');
      return null;
    }
    const startedAt = Date.now();
    const headers = { Authorization: `Bearer ${token}` };
    const oabs = await this.getOabs(headers);
    let counters = emptyCounters(oabs.length);
    for (const oab of oabs) {
      const result = await this.syncOabWindow(headers, oab, from, to);
      counters = sumCounters(counters, result);
    }
    recordDiagnosticEvent(`${eventPrefix}_finished`, counters.erros ? 'warning' : 'success', `Mural: ${counters.recebidas} recebidas, ${counters.novas} novas, ${counters.puladas} duplicadas`, counters, Date.now() - startedAt);
    return counters;
  }

  /**
   * Executa a consulta de uma OAB numa janela de datas, reportando
   * progresso via callback — usado pela tarefa `mural_request` do worker
   * unificado (Fase 7), que não tem estado local próprio.
   */
  async runOabWindowTask(
    oabNumber: string,
    oabUf: string,
    dataInicio: string,
    dataFim: string,
    onProgress?: (page: number, counters: SyncCounters) => void,
  ): Promise<SyncCounters> {
    const token = this.pairing.getDeviceToken();
    if (!token) throw new Error('CS não está pareado.');
    const headers = { Authorization: `Bearer ${token}` };
    const from = new Date(`${dataInicio}T00:00:00Z`);
    const to = new Date(`${dataFim}T00:00:00Z`);
    return this.syncOabWindow(headers, { oab_number: oabNumber, oab_uf: oabUf }, from, to, undefined, onProgress);
  }

  private async syncOabWindow(headers: Record<string, string>, oab: Oab, from: Date, to: Date, onPage?: (page: number) => void, onProgress?: (page: number, counters: SyncCounters) => void): Promise<SyncCounters> {
    const counters = emptyCounters();
    let pagina = 1;
    while (true) {
      const response = await this.mural.buscarPorOAB(oab.oab_number, oab.oab_uf, dateKey(from), dateKey(to), pagina);
      onPage?.(pagina);
      const items = response.items ?? [];
      const result = await this.sendBatch(headers, items);
      counters.recebidas += items.length;
      counters.novas += result.novas;
      counters.puladas += result.puladas;
      counters.erros += result.erros;
      onProgress?.(pagina, counters);
      if (items.length < 100) break;
      pagina += 1;
      if (pagina > MAX_PAGES_PER_CHUNK) throw new Error(`Limite de paginas atingido para a OAB ${oab.oab_number}/${oab.oab_uf} em ${dateKey(from)}`);
      await sleep(REQUEST_DELAY_MS);
    }
    return counters;
  }

  private async sendBatch(headers: Record<string, string>, comunicacoes: MuralComunicacao[]) {
    if (comunicacoes.length === 0) return { novas: 0, puladas: 0, erros: 0 };
    const response = await fetch(`${MEUJUDI_WEB_URL}/api/cs/sync/mural`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ comunicacoes }),
    });
    const result = await response.json() as { novas?: number; puladas?: number; erros?: number; error?: string };
    if (!response.ok) throw new Error(result.error || `Sincronizacao Web HTTP ${response.status}`);
    return { novas: result.novas ?? 0, puladas: result.puladas ?? 0, erros: result.erros ?? 0 };
  }
}
