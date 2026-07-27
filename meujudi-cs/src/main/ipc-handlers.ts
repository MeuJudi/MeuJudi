/**
 * MeuJudi CS — IPC Handlers
 *
 * Registra todos os handlers de IPC que o preload (window.meujudi) pode chamar.
 * Conecta o renderer (Next.js) com o main process (Electron).
 */

import { ipcMain, app, shell } from 'electron';
import { PJeAuth } from './pje-auth';
import { Scheduler } from './scheduler';
import { Diagnostic } from './diagnostic';
import { logger, getRecentLogs } from './logger';
import { enviarRelatorioSupabase } from './supabase-reporter';
import { Pairing } from './pairing';
import { MuralSync } from './mural-sync';
import { ConfirmADVService } from './confirmadv';
import type { StatusReporter } from './status-reporter';
import type { PJeStatus, PublicSession, LogEntry, DiagnosticReport, ConfirmADVValidation } from '../shared/types';

/**
 * Registra todos os IPC handlers. Deve ser chamado uma vez no app.whenReady().
 */
export function registerIPCHandlers(pairing = new Pairing(), statusReporter?: StatusReporter) {
  const auth = new PJeAuth();
  const muralSync = new MuralSync(pairing);
  const confirmAdv = new ConfirmADVService(pairing);
  const scheduler = new Scheduler(pairing, muralSync, statusReporter);
  scheduler.start();
  confirmAdv.start();
  const diagnostic = new Diagnostic();

  // ============================================================
  //  IPC: PJe
  // ============================================================

  ipcMain.handle('pje:show-login', async (): Promise<PublicSession> => {
    logger.info('IPC: pje:show-login');
    try {
      return await auth.showLoginWindow();
    } catch (err: any) {
      logger.error('Login PJe falhou; executando diagnostico automatico:', err.message);
      try {
        await diagnostic.run('pje_login_failed', err.message || 'Erro desconhecido no login PJe');
      } catch (diagnosticErr: any) {
        logger.error('Falha ao executar/enviar diagnostico automatico:', diagnosticErr.message);
      }
      throw err;
    }
  });

  ipcMain.handle('pje:status', async (): Promise<PJeStatus> => {
    return auth.getStatus();
  });

  ipcMain.handle('pje:disconnect', async (): Promise<void> => {
    logger.info('IPC: pje:disconnect');
    await auth.disconnect();
  });

  ipcMain.handle('pje:sync-now', async () => {
    logger.info('IPC: pje:sync-now');
    return scheduler.tickNow();
  });

  ipcMain.handle('pje:get-logs', async (_event, limit: number = 100): Promise<LogEntry[]> => {
    return getRecentLogs(limit).slice().reverse();
  });

  ipcMain.handle('pairing:submit-code', async (_event, codigo: string) => pairing.pair(codigo));
  ipcMain.handle('pairing:status', async () => pairing.getStatus());
  ipcMain.handle('pairing:unpair', async () => pairing.unpair());

  ipcMain.handle('mural:sync-historical', async () => {
    logger.info('IPC: mural:sync-historical');
    return muralSync.syncHistorical();
  });

  ipcMain.handle('mural:history-status', async () => ({
    running: muralSync.isHistoricalRunning(),
    checkpoint: muralSync.getHistoricalCheckpoint(),
  }));

  ipcMain.handle('mural:poll-now', async () => {
    logger.info('IPC: mural:poll-now');
    await muralSync.processPendingRequests();
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

  return () => {
    scheduler.stop();
    confirmAdv.stop();
  };
}
