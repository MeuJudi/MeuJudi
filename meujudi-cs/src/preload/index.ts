/**
 * MeuJudi CS — Preload script
 *
 * Bridge seguro entre Electron main process e renderer (Next.js).
 * Expõe uma API limitada e tipada via contextBridge.
 *
 * IMPORTANTE: nunca expor APIs privilegiadas (fs, child_process, etc) diretamente.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from '../shared/types';

const api: ElectronAPI = {
  pje: {
    showLoginWindow: () => ipcRenderer.invoke('pje:show-login'),
    getStatus: () => ipcRenderer.invoke('pje:status'),
    disconnect: () => ipcRenderer.invoke('pje:disconnect'),
    syncNow: () => ipcRenderer.invoke('pje:sync-now'),
    getLogs: (limit = 100) => ipcRenderer.invoke('pje:get-logs', limit),
  },
  diagnostic: {
    run: () => ipcRenderer.invoke('diagnostic:run'),
    sendToSupabase: (report) => ipcRenderer.invoke('diagnostic:send-to-supabase', report),
    getLast: () => ipcRenderer.invoke('diagnostic:get-last'),
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
  mural: {
    syncHistorical: () => ipcRenderer.invoke('mural:sync-historical'),
    getHistoricalStatus: () => ipcRenderer.invoke('mural:history-status'),
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
