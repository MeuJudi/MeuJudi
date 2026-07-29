import { useCallback, useEffect, useState } from 'react';
import type { ConnectionStatus } from '@shared/types';

const DEFAULT_STATUS: ConnectionStatus = {
  paired: false,
  online: false,
  lastHeartbeatAt: null,
  lastError: null,
  revoked: false,
};

/**
 * Status de conexão com o MeuJudi Web (heartbeat), separado do status de
 * login na fonte (usePdpjStatus) e do pareamento em si (usePairing).
 * Ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 2.
 */
export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>(DEFAULT_STATUS);

  const refresh = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const current = await window.meujudi.connection.getStatus();
      setStatus(current);
    } catch {
      // silencioso — mantém último valor conhecido
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return status;
}
