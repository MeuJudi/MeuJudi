/**
 * MeuJudi Sync — handlers do Mural pro worker unificado (Fase 7, completada).
 *
 * Os 4 mecanismos do Mural agora rodam como tarefas da fila unificada
 * (sync_tasks), reservadas pelo SyncWorker:
 * - mural_request: consulta individual/periódica por OAB (pedida pelo
 *   cron solicitar-mural no Web, ou pelo botão de sincronização manual).
 * - mural_push: push incremental (24h de lookback na primeira vez, depois
 *   cursor por OAB) — dispara sozinho a cada 30min.
 * - mural_sweep: varredura de segurança dos últimos 7 dias — diária, 3h.
 * - mural_historical: importação de 12 meses em lotes semanais, com
 *   retomada — semanal, domingo 3h.
 *
 * push/sweep/historical não são pedidos por ninguém — são recorrentes por
 * natureza, então quem cria a tarefa na fila é o próprio CS (via
 * startMuralScheduledTasks), num cron local, exatamente como o Scheduler
 * antigo fazia. A diferença é que agora a execução passa pelo SyncWorker
 * (lease, heartbeat, correlation id, causa/próximo passo na Fila) em vez
 * do TaskQueue local — Scheduler e task-queue.ts foram retirados.
 *
 * A retomada da importação histórica continua local (cs-mural-history,
 * já testada) — o heartbeat só espelha esse checkpoint pra visibilidade.
 */

import cron from 'node-cron';
import { logger, recordDiagnosticEvent } from './logger';
import type { MuralSync } from './mural-sync';
import type { MuralPush } from './mural-push';
import type { Pairing } from './pairing';
import type { TaskQueueClient } from './task-queue-client';
import type { TaskHandler, TaskHandlerResult } from './sync-worker';
import type { SyncTask } from '../shared/types';

interface MuralRequestCursor {
  oabNumber: string;
  oabUf: string;
  dataInicio: string;
  dataFim: string;
}

function naoPareado(): TaskHandlerResult {
  return { status: 'failed', errorCode: 'sem_pareamento', errorMessage: 'CS não está pareado.' };
}

export function createMuralTaskHandlers(pairing: Pairing, muralSync: MuralSync, muralPush: MuralPush) {
  const handleMuralRequest: TaskHandler = async (task: SyncTask): Promise<TaskHandlerResult> => {
    const cursor = task.cursor as MuralRequestCursor | null;
    if (!cursor?.oabNumber || !cursor.oabUf || !cursor.dataInicio || !cursor.dataFim) {
      return { status: 'failed', errorCode: 'estado_invalido', errorMessage: 'Tarefa mural_request sem OAB/UF/janela de datas no cursor.' };
    }

    try {
      const counters = await muralSync.runOabWindowTask(cursor.oabNumber, cursor.oabUf, cursor.dataInicio, cursor.dataFim);
      recordDiagnosticEvent(
        'mural_request_task_finished',
        counters.erros ? 'warning' : 'success',
        `Mural OAB ${cursor.oabNumber}/${cursor.oabUf}: ${counters.novas} novas`,
        counters,
      );
      return {
        status: counters.erros ? 'completed_with_warnings' : 'completed',
        counters: { recebidas: counters.recebidas, novas: counters.novas, puladas: counters.puladas, erros: counters.erros },
      };
    } catch (err: any) {
      logger.warn('[MuralTasks] Falha na tarefa mural_request:', err.message);
      return { status: 'failed', errorCode: 'erro_mural', errorMessage: err.message };
    }
  };

  const handleMuralPush: TaskHandler = async (): Promise<TaskHandlerResult> => {
    if (!pairing.isPaired()) return naoPareado();
    try {
      const result = await muralPush.run();
      return { status: 'completed', counters: result };
    } catch (err: any) {
      logger.warn('[MuralTasks] Falha na tarefa mural_push:', err.message);
      return { status: 'failed', errorCode: 'erro_mural', errorMessage: err.message };
    }
  };

  const handleMuralSweep: TaskHandler = async (): Promise<TaskHandlerResult> => {
    try {
      const result = await muralSync.tick();
      if (!result) return naoPareado();
      return {
        status: result.erros ? 'completed_with_warnings' : 'completed',
        counters: { oabs: result.oabs, recebidas: result.recebidas, novas: result.novas, puladas: result.puladas, erros: result.erros },
      };
    } catch (err: any) {
      logger.warn('[MuralTasks] Falha na tarefa mural_sweep:', err.message);
      return { status: 'failed', errorCode: 'erro_mural', errorMessage: err.message };
    }
  };

  const handleMuralHistorical: TaskHandler = async (task: SyncTask, ctx): Promise<TaskHandlerResult> => {
    try {
      const result = await muralSync.syncHistorical((taskIndex, totalTasks, counters) => {
        void ctx.heartbeat({ taskIndex, totalTasks }, { recebidas: counters.recebidas, novas: counters.novas, erros: counters.erros });
      });
      if (!result) return naoPareado();
      return {
        status: result.erros ? 'completed_with_warnings' : 'completed',
        counters: { recebidas: result.recebidas, novas: result.novas, puladas: result.puladas, erros: result.erros, semanas: result.semanas },
      };
    } catch (err: any) {
      logger.warn('[MuralTasks] Falha na tarefa mural_historical:', err.message);
      return { status: 'failed', errorCode: 'erro_mural', errorMessage: err.message };
    }
  };

  return { handleMuralRequest, handleMuralPush, handleMuralSweep, handleMuralHistorical };
}

/**
 * Cria as tarefas recorrentes do Mural (push/sweep/historical) na fila,
 * no mesmo ritmo que o Scheduler antigo usava. A chave de idempotência é
 * ancorada num intervalo de tempo — reexecutar dentro da mesma janela é
 * ignorado (409) automaticamente pelo servidor, sem precisar checar "já
 * existe uma pendente" manualmente.
 */
export function startMuralScheduledTasks(taskQueueClient: TaskQueueClient): { stop: () => void } {
  const criar = (type: string, idempotencyKey: string, priority: number) => {
    taskQueueClient
      .create({ source: 'mural', type, idempotencyKey, priority })
      .catch((err) => logger.warn(`[MuralTasks] Falha ao criar tarefa ${type}:`, err.message));
  };

  const jobs = [
    cron.schedule('*/30 * * * *', () => {
      const bucket = Math.floor(Date.now() / (30 * 60_000));
      criar('mural_push', `mural_push:${bucket}`, 3);
    }),
    cron.schedule('0 3 * * *', () => {
      const dia = new Date().toISOString().slice(0, 10);
      criar('mural_sweep', `mural_sweep:${dia}`, 4);
    }),
    cron.schedule('0 3 * * 0', () => {
      const dia = new Date().toISOString().slice(0, 10);
      criar('mural_historical', `mural_historical:${dia}`, 5);
    }),
  ];

  logger.info('[MuralTasks] Tarefas recorrentes do Mural agendadas (push/sweep/historical).');

  return {
    stop: () => jobs.forEach((job) => job.stop()),
  };
}
