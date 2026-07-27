/**
 * LogsViewer — lista os últimos logs estruturados do MeuJudi CS.
 */

import { useLogs } from '@/hooks/usePJeStatus';
import type { LogEntry } from '@shared/types';

const LEVEL_STYLES: Record<LogEntry['level'], string> = {
  debug: 'text-gray-500',
  info: 'text-blue-600',
  warn: 'text-yellow-600',
  error: 'text-red-600 font-semibold',
};

const LEVEL_ICONS: Record<LogEntry['level'], string> = {
  debug: '🔍',
  info: 'ℹ️',
  warn: '⚠️',
  error: '❌',
};

interface LogsViewerProps {
  limit?: number;
  height?: string;
  showRefresh?: boolean;
}

export function LogsViewer({ limit = 100, height = 'max-h-96', showRefresh = true }: LogsViewerProps) {
  const { logs, refresh } = useLogs(limit);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Logs ({logs.length})</h3>
        {showRefresh && (
          <button onClick={refresh} className="btn-secondary text-xs">
            🔄 Atualizar
          </button>
        )}
      </div>
      <div className={`overflow-y-auto ${height} bg-gray-900 text-gray-100 rounded-lg p-3 font-mono text-xs`}>
        {logs.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nenhum log ainda.</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-2 py-0.5 hover:bg-gray-800 px-1 rounded">
              <span className="text-gray-500 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString('pt-BR')}
              </span>
              <span className={`shrink-0 ${LEVEL_STYLES[log.level]}`}>
                {LEVEL_ICONS[log.level]} {log.level.toUpperCase()}
              </span>
              <span className="flex-1 break-all">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
