import { useCallback, useEffect, useState } from 'react';
import type { SyncTask, TaskBatch } from '@shared/types';

/** Lê o resumo agregado da fila por lote (Supabase, sync_tasks) — só leitura, não reserva nada. */
export function useTaskBatches() {
  const [batches, setBatches] = useState<TaskBatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!window.meujudi) return;
    try {
      const current = await window.meujudi.queue.listBatches();
      setBatches(current);
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

  return { batches, error, loading, refresh };
}

/** Tarefas individuais de um lote — buscado sob demanda, só quando o card é expandido. */
export function useBatchTasks(batchKey: string | null) {
  const [tasks, setTasks] = useState<SyncTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchKey || !window.meujudi) {
      setTasks([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    window.meujudi.queue
      .listBatchTasks(batchKey)
      .then((current) => {
        if (!cancelled) {
          setTasks(current);
          setError(null);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Não foi possível consultar o lote.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [batchKey]);

  return { tasks, loading, error };
}
