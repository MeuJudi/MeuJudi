/**
 * MeuJudi Sync — IPC Handlers
 *
 * Registra todos os handlers de IPC que o preload (window.meujudi) pode chamar.
 * Conecta o renderer (Next.js) com o main process (Electron).
 */

import { ipcMain, app, shell } from 'electron';
import { PdpjAuth } from './pdpj-auth';
import { Diagnostic } from './diagnostic';
import { logger, getRecentLogs } from './logger';
import { enviarRelatorioSupabase } from './supabase-reporter';
import { Pairing } from './pairing';
import { MuralSync } from './mural-sync';
import { MuralPush } from './mural-push';
import { ConfirmADVService } from './confirmadv';
import { TaskQueueClient } from './task-queue-client';
import { SyncWorker } from './sync-worker';
import { createPdpjTaskHandlers } from './pdpj-tasks';
import { createMuralTaskHandlers, startMuralScheduledTasks } from './mural-tasks';
import { DocumentRequests } from './document-requests';
import type { StatusReporter, ConnectionStatus } from './status-reporter';
import type { PdpjStatus, PublicSession, LogEntry, DiagnosticReport, ConfirmADVValidation, SyncTask, TaskBatch, UnifiedSyncProgress } from '../shared/types';

/**
 * Registra todos os IPC handlers. Deve ser chamado uma vez no app.whenReady().
 */
export function registerIPCHandlers(pairing = new Pairing(), statusReporter?: StatusReporter) {
  const auth = new PdpjAuth(pairing);
  const muralSync = new MuralSync(pairing);
  const muralPush = new MuralPush(pairing);
  const confirmAdv = new ConfirmADVService(pairing);
  const taskQueueClient = new TaskQueueClient(pairing);
  const syncWorker = new SyncWorker(taskQueueClient, statusReporter);
  const { handlePdpjOab, handlePdpjCnj } = createPdpjTaskHandlers(pairing, auth);
  syncWorker.registerHandler('pdpj', 'pdpj_oab', handlePdpjOab);
  syncWorker.registerHandler('pdpj', 'pdpj_cnj', handlePdpjCnj);
  const { handleMuralRequest, handleMuralPush, handleMuralSweep, handleMuralHistorical } = createMuralTaskHandlers(pairing, muralSync, muralPush);
  syncWorker.registerHandler('mural', 'mural_request', handleMuralRequest);
  syncWorker.registerHandler('mural', 'mural_push', handleMuralPush);
  syncWorker.registerHandler('mural', 'mural_sweep', handleMuralSweep);
  syncWorker.registerHandler('mural', 'mural_historical', handleMuralHistorical);
  syncWorker.start();
  const muralScheduledTasks = startMuralScheduledTasks(taskQueueClient);
  confirmAdv.start();
  auth.startAutoValidation();
  const documentRequests = new DocumentRequests(pairing, auth);
  documentRequests.start();
  const diagnostic = new Diagnostic();

  // ============================================================
  //  IPC: Portal PDPJ/Jus
  // ============================================================

  ipcMain.handle('pdpj:show-login', async (): Promise<PublicSession> => {
    logger.info('IPC: pdpj:show-login');
    try {
      return await auth.showLoginWindow();
    } catch (err: any) {
      logger.error('Login PDPJ falhou; executando diagnostico automatico:', err.message);
      try {
        await diagnostic.run('pdpj_login_failed', err.message || 'Erro desconhecido no login PDPJ');
      } catch (diagnosticErr: any) {
        logger.error('Falha ao executar/enviar diagnostico automatico:', diagnosticErr.message);
      }
      throw err;
    }
  });

  ipcMain.handle('pdpj:status', async (): Promise<PdpjStatus> => {
    return auth.getStatus();
  });

  ipcMain.handle('pdpj:disconnect', async (): Promise<void> => {
    logger.info('IPC: pdpj:disconnect');
    await auth.disconnect();
  });

  ipcMain.handle('pdpj:open-jus', async () => auth.openJus());
  ipcMain.handle('pdpj:validate-api', async () => {
    logger.info('IPC: pdpj:validate-api');
    return auth.ensureApiSession(true);
  });

  ipcMain.handle('pairing:submit-code', async (_event, codigo: string) => pairing.pair(codigo));
  ipcMain.handle('pairing:status', async () => pairing.getStatus());
  ipcMain.handle('pairing:unpair', async () => pairing.unpair());

  ipcMain.handle('sync:now', async (): Promise<UnifiedSyncProgress> => {
    logger.info('IPC: sync:now');
    return syncWorker.syncNow();
  });

  ipcMain.handle('sync:get-progress', async (): Promise<UnifiedSyncProgress | null> => {
    return syncWorker.getCurrentProgress() ?? syncWorker.getLastProgress();
  });

  ipcMain.handle('queue:list-tasks', async (): Promise<SyncTask[]> => {
    try {
      return await taskQueueClient.list();
    } catch (err: any) {
      logger.warn('Falha ao listar fila de tarefas:', err.message);
      return [];
    }
  });

  ipcMain.handle('queue:list-batches', async (): Promise<TaskBatch[]> => {
    try {
      return await taskQueueClient.listBatches();
    } catch (err: any) {
      logger.warn('Falha ao listar lotes da fila:', err.message);
      return [];
    }
  });

  ipcMain.handle('queue:list-batch-tasks', async (_event, batchKey: string): Promise<SyncTask[]> => {
    try {
      return await taskQueueClient.listBatchTasks(batchKey);
    } catch (err: any) {
      logger.warn('Falha ao listar tarefas do lote:', err.message);
      return [];
    }
  });

  ipcMain.handle('connection:get-status', async (): Promise<ConnectionStatus> => {
    return statusReporter?.getConnectionStatus() ?? {
      paired: pairing.isPaired(),
      online: false,
      lastHeartbeatAt: null,
      lastError: null,
      revoked: false,
    };
  });

  ipcMain.handle('mural:sync-historical', async () => {
    logger.info('IPC: mural:sync-historical');
    return muralSync.syncHistorical();
  });

  ipcMain.handle('mural:history-status', async () => ({
    running: muralSync.isHistoricalRunning(),
    checkpoint: muralSync.getHistoricalCheckpoint(),
  }));

  ipcMain.handle('mural:poll-now', async (): Promise<UnifiedSyncProgress> => {
    // Antes chamava o poller antigo de /api/cs/mural-requests (Fase 7
    // migrou isso pra sync_tasks) — agora só dispara um ciclo do worker
    // unificado, igual o "Sincronizar agora" da Home.
    logger.info('IPC: mural:poll-now');
    return syncWorker.syncNow();
  });

  ipcMain.handle('mural:progress', async () => muralSync.getProgress());
  ipcMain.handle('mural:remote-status', async () => muralSync.getRemoteStatus());

  // ============================================================
  //  IPC: ConfirmADV (validacao de OAB)
  // ============================================================

  ipcMain.handle('oab:get-current', async (): Promise<ConfirmADVValidation | null> => {
    return confirmAdv.getCurrent();
  });

  ipcMain.handle('oab:open-active', async (): Promise<ConfirmADVValidation | null> => {
    logger.info('IPC: oab:open-active');
    return confirmAdv.openActive();
  });

  ipcMain.handle('oab:check-and-open', async () => {
    logger.info('IPC: oab:check-and-open');
    return confirmAdv.checkAndOpen();
  });

  // ============================================================
  //  IPC: Diagnostic
  // ============================================================

  ipcMain.handle('diagnostic:run', async (): Promise<DiagnosticReport> => {
    logger.info('IPC: diagnostic:run');
    return diagnostic.run();
  });

  ipcMain.handle('diagnostic:send-to-supabase', async (_event, report: DiagnosticReport) => {
    logger.info('IPC: diagnostic:send-to-supabase');
    return enviarRelatorioSupabase(report);
  });

  ipcMain.handle('diagnostic:get-logs', async (_event, limit: number = 100): Promise<LogEntry[]> => {
    return getRecentLogs(limit).slice().reverse();
  });

  ipcMain.handle('diagnostic:get-last', async (): Promise<DiagnosticReport | null> => {
    const fs = require('fs');
    const path = require('path');
    try {
      const userData = app.getPath('userData');
      const diagDir = path.join(userData, 'diagnostics');
      if (!fs.existsSync(diagDir)) return null;
      const files = fs
        .readdirSync(diagDir)
        .filter((f: string) => f.startsWith('report-') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (files.length === 0) return null;
      const last = fs.readFileSync(path.join(diagDir, files[0]), 'utf-8');
      return JSON.parse(last);
    } catch (err: any) {
      logger.error('Erro ao ler último relatório:', err.message);
      return null;
    }
  });

  // ============================================================
  //  IPC: App
  // ============================================================

  ipcMain.handle('app:get-version', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:open-logs-folder', async () => {
    const logsPath = `${app.getPath('userData')}\\logs`;
    await shell.openPath(logsPath);
  });

  return {
    stop: () => {
      muralScheduledTasks.stop();
      confirmAdv.stop();
      syncWorker.stop();
      auth.stopAutoValidation();
      documentRequests.stop();
    },
    triggerSync: () => syncWorker.syncNow(),
  };
}
