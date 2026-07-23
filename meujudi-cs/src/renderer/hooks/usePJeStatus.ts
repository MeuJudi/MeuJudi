/**
 * Hook usePJeStatus — polling 1x/segundo do status de conexão com PJe.
 * Retorna o status atual + funções de ação.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PJeStatus, PublicSession, LogEntry } from '@shared/types';

interface UsePJeStatusReturn {
  status: PJeStatus;
  isLoading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  syncNow: () => Promise<{ processos: number; pecas: number; durationMs: number } | null>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 1000;

export function usePJeStatus(): UsePJeStatusReturn {
  const [status, setStatus] = useState<PJeStatus>({ state: 'disconnected' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    if (!window.meujudi) {
      setError('API do Electron não disponível (rode dentro do Electron, não do browser)');
      return;
    }
    try {
      const s = await window.meujudi.pje.getStatus();
      setStatus(s);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Erro ao obter status');
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const session = await window.meujudi.pje.showLoginWindow();
      setStatus({ state: 'connected', session });
    } catch (err: any) {
      setError(err.message || 'Erro no login');
      setStatus({ state: 'error', message: err.message || 'Erro no login' });
    } finally {
      setIsLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setIsLoading(true);
    try {
      await window.meujudi.pje.disconnect();
      setStatus({ state: 'disconnected' });
    } catch (err: any) {
      setError(err.message || 'Erro ao desconectar');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const syncNow = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await window.meujudi.pje.syncNow();
      return result;
    } catch (err: any) {
      setError(err.message || 'Erro na sincronização');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { status, isLoading, error, connect, disconnect, syncNow, refresh };
}

/**
 * Hook useLogs — busca os últimos N logs.
 */
export function useLogs(limit = 100): { logs: LogEntry[]; refresh: () => Promise<void> } {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const fetched = await window.meujudi.pje.getLogs(limit);
      setLogs(fetched);
    } catch {
      // silencioso
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { logs, refresh };
}
