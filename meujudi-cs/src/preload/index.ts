/**
 * MeuJudi Sync — Preload script
 *
 * Bridge seguro entre Electron main process e renderer (Next.js).
 * Expõe uma API limitada e tipada via contextBridge.
 *
 * IMPORTANTE: nunca expor APIs privilegiadas (fs, child_process, etc) diretamente.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
  pdpj: {
    showLoginWindow: () => ipcRenderer.invoke('pdpj:show-login'),
    getStatus: () => ipcRenderer.invoke('pdpj:status'),
    disconnect: () => ipcRenderer.invoke('pdpj:disconnect'),
    openJus: () => ipcRenderer.invoke('pdpj:open-jus'),
    validateApi: () => ipcRenderer.invoke('pdpj:validate-api'),
  },
  diagnostic: {
    run: () => ipcRenderer.invoke('diagnostic:run'),
    sendToSupabase: (report) => ipcRenderer.invoke('diagnostic:send-to-supabase', report),
    getLast: () => ipcRenderer.invoke('diagnostic:get-last'),
    getLogs: (limit = 100) => ipcRenderer.invoke('diagnostic:get-logs', limit),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder'),
  },
  pairing: {
    submitCode: (codigo) => ipcRenderer.invoke('pairing:submit-code', codigo),
    getStatus: () => ipcRenderer.invoke('pairing:status'),
    unpair: () => ipcRenderer.invoke('pairing:unpair'),
  },
  connection: {
    getStatus: () => ipcRenderer.invoke('connection:get-status'),
  },
  queue: {
    listTasks: () => ipcRenderer.invoke('queue:list-tasks'),
    listBatches: () => ipcRenderer.invoke('queue:list-batches'),
    listBatchTasks: (batchKey) => ipcRenderer.invoke('queue:list-batch-tasks', batchKey),
  },
  sync: {
    now: () => ipcRenderer.invoke('sync:now'),
    getProgress: () => ipcRenderer.invoke('sync:get-progress'),
  },
  mural: {
    syncHistorical: () => ipcRenderer.invoke('mural:sync-historical'),
    getHistoricalStatus: () => ipcRenderer.invoke('mural:history-status'),
    pollNow: () => ipcRenderer.invoke('mural:poll-now'),
    getProgress: () => ipcRenderer.invoke('mural:progress'),
    getRemoteStatus: () => ipcRenderer.invoke('mural:remote-status'),
  },
  oab: {
    getCurrent: () => ipcRenderer.invoke('oab:get-current'),
    openActive: () => ipcRenderer.invoke('oab:open-active'),
    checkAndOpen: () => ipcRenderer.invoke('oab:check-and-open'),
  },
};

contextBridge.exposeInMainWorld('meujudi', api);

// Também expõe types no globalThis pro TypeScript reconhecer window.meujudi
export type { ElectronAPI };
