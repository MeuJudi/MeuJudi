/**
 * Hook usePdpjStatus — polling 1x/segundo do status de conexão com o
 * Portal PDPJ/Jus. Retorna o status atual + funções de ação.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { PdpjStatus, LogEntry } from '@shared/types';

interface UsePdpjStatusReturn {
  status: PdpjStatus;
  isLoading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refresh: () => Promise<void>;
}

const POLL_INTERVAL_MS = 1000;

export function usePdpjStatus(): UsePdpjStatusReturn {
  const [status, setStatus] = useState<PdpjStatus>({ state: 'disconnected' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const refresh = useCallback(async () => {
    if (!window.meujudi) {
      setError('API do Electron não disponível (rode dentro do Electron, não do browser)');
      return;
    }
    try {
      const s = await window.meujudi.pdpj.getStatus();
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
      const session = await window.meujudi.pdpj.showLoginWindow();
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
      await window.meujudi.pdpj.disconnect();
      setStatus({ state: 'disconnected' });
    } catch (err: any) {
      setError(err.message || 'Erro ao desconectar');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { status, isLoading, error, connect, disconnect, refresh };
}

/**
 * Hook useLogs — busca os últimos N logs (via diagnostic:get-logs).
 */
export function useLogs(limit = 100): { logs: LogEntry[]; refresh: () => Promise<void> } {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const refresh = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const fetched = await window.meujudi.diagnostic.getLogs(limit);
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
