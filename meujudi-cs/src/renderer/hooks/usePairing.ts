import { useCallback, useEffect, useState } from 'react';
import type { PairingInfo } from '@shared/types';

export function usePairing() {
  const [status, setStatus] = useState<PairingInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!window.meujudi) {
      setError('A ponte do MeuJudi CS nao foi carregada. Feche e abra o aplicativo novamente.');
      setIsLoading(false);
      return;
    }
    try {
      const current = await Promise.race([
        window.meujudi.pairing.getStatus(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
      setStatus(current);
      setError(null);
    }
    catch (err: any) { setError(err.message || 'Erro ao consultar pareamento'); }
    finally { setIsLoading(false); }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1000);
    return () => clearInterval(timer);
  }, [refresh]);

  const submitCode = useCallback(async (codigo: string) => {
    setIsLoading(true); setError(null);
    try { const next = await window.meujudi.pairing.submitCode(codigo); setStatus(next); return next; }
    catch (err: any) { setError(err.message || 'Codigo invalido ou expirado'); return null; }
    finally { setIsLoading(false); }
  }, []);

  const unpair = useCallback(async () => {
    setIsLoading(true);
    try { await window.meujudi.pairing.unpair(); setStatus(null); }
    catch (err: any) { setError(err.message || 'Nao foi possivel desconectar'); }
    finally { setIsLoading(false); }
  }, []);

  return { status, isLoading, error, submitCode, unpair };
}
