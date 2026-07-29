import { useCallback, useEffect, useState } from 'react';
import type { SyncTask } from '@shared/types';

/** Lê a fila persistente (Supabase, sync_tasks) — só leitura, não reserva nada. */
export function useTaskQueue() {
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const current = await window.meujudi.queue.listTasks();
      setTasks(current);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Não foi possível consultar a fila.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { tasks, error, loading, refresh };
}
