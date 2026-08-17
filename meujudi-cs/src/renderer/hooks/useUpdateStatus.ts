import { useCallback, useEffect, useState } from 'react';
import type { UpdateState } from '@shared/types';

const DEFAULT_STATE: UpdateState = { status: 'idle' };

/**
 * Estado da atualização automática (electron-updater), pra mostrar o botão
 * "Atualizar agora" na Home só quando o download já terminou (`ready`).
 */
export function useUpdateStatus() {
  const [state, setState] = useState<UpdateState>(DEFAULT_STATE);

  const refresh = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const current = await window.meujudi.app.getUpdateStatus();
      setState(current);
    } catch {
      // silencioso — mantém último valor conhecido
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return state;
}
