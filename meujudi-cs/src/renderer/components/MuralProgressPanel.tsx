import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HistoricalSyncStatus, MuralProgressSnapshot, MuralRemoteRequest, MuralRequestProgress } from '../../shared/types';

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatPeriod(from: string, to: string) {
  return `${new Intl.DateTimeFormat('pt-BR').format(new Date(`${from}T00:00:00`))} a ${new Intl.DateTimeFormat('pt-BR').format(new Date(`${to}T00:00:00`))}`;
}

function statusLabel(status: MuralRemoteRequest['status'] | MuralRequestProgress['status']) {
  if (status === 'pending') return 'Pendente';
  if (status === 'processing') return 'Em processamento';
  if (status === 'failed') return 'Falhou';
  return 'Concluída';
}

function statusClass(status: MuralRemoteRequest['status'] | MuralRequestProgress['status']) {
  if (status === 'processing') return 'bg-blue-50 text-blue-700';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  if (status === 'pending') return 'bg-amber-50 text-amber-700';
  return 'bg-emerald-50 text-emerald-700';
}

function ProgressBar({ progress }: { progress: MuralRequestProgress }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-gray-500">
        <span>Página {progress.page || 0}</span>
        <span>{progress.recebidas} recebidas</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary-600" />
      </div>
    </div>
  );
}

function RemoteRequestRow({ request }: { request: MuralRemoteRequest }) {
  const result = request.result ?? {};
  const received = typeof result.recebidas === 'number' ? result.recebidas : null;
  const fresh = typeof result.novas === 'number' ? result.novas : null;
  return (
    <li className="border-t border-gray-100 py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-800">OAB {request.oab_number}/{request.oab_uf}</p>
          <p className="text-xs text-gray-500">{formatPeriod(request.data_inicio, request.data_fim)}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass(request.status)}`}>
          {statusLabel(request.status)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>Solicitada {formatDate(request.created_at)}</span>
        {received !== null && <span>{received} recebidas</span>}
        {fresh !== null && <span>{fresh} novas</span>}
        {request.error_message && <span className="text-red-600">{request.error_message}</span>}
      </div>
    </li>
  );
}

export function MuralProgressPanel() {
  const [progress, setProgress] = useState<MuralProgressSnapshot | null>(null);
  const [historical, setHistorical] = useState<HistoricalSyncStatus | null>(null);
  const [remote, setRemote] = useState<MuralRemoteRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [polling, setPolling] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [local, history, requests] = await Promise.all([
        window.meujudi.mural.getProgress(),
        window.meujudi.mural.getHistoricalStatus(),
        window.meujudi.mural.getRemoteStatus(),
      ]);
      setProgress(local);
      setHistorical(history);
      setRemote(requests);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o status do Mural.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const pollNow = useCallback(async () => {
    setPolling(true);
    try {
      await window.meujudi.mural.pollNow();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível verificar as solicitações.');
    } finally {
      setPolling(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const recent = useMemo(() => remote.length ? remote : progress?.recent.map((item) => ({
    id: item.requestId,
    oab_number: item.oab,
    oab_uf: item.uf,
    data_inicio: item.dataInicio,
    data_fim: item.dataFim,
    status: item.status,
    created_at: item.startedAt,
    claimed_at: item.startedAt,
    completed_at: item.completedAt,
    result: { recebidas: item.recebidas, novas: item.novas },
    error_message: item.message,
  } satisfies MuralRemoteRequest)) ?? [], [remote, progress?.recent]);

  return (
    <section className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sincronizações do Mural</h2>
          <p className="mt-1 text-sm text-gray-500">
            Importação histórica e verificação manual (abaixo). Consultas individuais e periódicas
            por OAB agora aparecem em <a href="/queue/" className="text-blue-700 underline">Fila de tarefas</a>.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => void refresh()} disabled={refreshing || polling}>
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
          <button type="button" className="btn-primary px-3 py-1.5 text-sm" onClick={() => void pollNow()} disabled={refreshing || polling}>
            {polling ? 'Verificando...' : 'Verificar agora'}
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}

      {progress?.current && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Pesquisa em andamento</p>
              <h3 className="mt-1 font-semibold text-gray-900">OAB {progress.current.oab}/{progress.current.uf}</h3>
              <p className="text-sm text-gray-600">{formatPeriod(progress.current.dataInicio, progress.current.dataFim)}</p>
            </div>
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">Consultando</span>
          </div>
          <ProgressBar progress={progress.current} />
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
            <div><strong className="block text-base text-gray-900">{progress.current.encontradas}</strong>únicas</div>
            <div><strong className="block text-base text-gray-900">{progress.current.novas}</strong>novas no Web</div>
            <div><strong className="block text-base text-gray-900">{progress.current.erros}</strong>erros</div>
          </div>
        </div>
      )}

      {historical?.running && historical.checkpoint && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Importação histórica</p>
              <h3 className="mt-1 font-semibold text-gray-900">Buscando os últimos meses</h3>
              <p className="text-sm text-gray-600">
                {historical.checkpoint.current
                  ? `OAB ${historical.checkpoint.current.oab}/${historical.checkpoint.current.uf} · página ${historical.checkpoint.current.page}`
                  : 'Preparando a próxima consulta'}
              </p>
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">Em andamento</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-gray-600">
            <div><strong className="block text-base text-gray-900">{historical.checkpoint.counters.recebidas}</strong>recebidas</div>
            <div><strong className="block text-base text-gray-900">{historical.checkpoint.counters.novas}</strong>novas</div>
            <div><strong className="block text-base text-gray-900">{historical.checkpoint.counters.erros}</strong>erros</div>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium text-gray-800">Solicitações recentes</h3>
          <span className="text-xs text-gray-400">Atualização automática</span>
        </div>
        {recent.length ? (
          <ul className="max-h-72 overflow-y-auto pr-1">
            {recent.map((request) => <RemoteRequestRow key={request.id} request={request} />)}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-gray-200 p-5 text-center text-sm text-gray-500">Nenhuma solicitação do Mural encontrada.</p>
        )}
      </div>
    </section>
  );
}
