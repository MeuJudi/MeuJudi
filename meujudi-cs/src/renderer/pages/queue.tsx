import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useTaskQueue } from '@/hooks/useTaskQueue';
import { classifyTaskError } from '@/lib/classify-task-error';
import type { SyncTask } from '@shared/types';

const STATUS_LABEL: Record<SyncTask['status'], string> = {
  pending: 'Pendente',
  claimed: 'Reservada',
  running: 'Em execução',
  waiting_external: 'Aguardando fonte',
  paused_login_required: 'Pausada — login necessário',
  paused_rate_limit: 'Pausada — limite da fonte',
  completed: 'Concluída',
  completed_with_warnings: 'Concluída com avisos',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const STATUS_CLASS: Record<SyncTask['status'], string> = {
  pending: 'bg-gray-100 text-gray-700',
  claimed: 'bg-blue-50 text-blue-700',
  running: 'bg-blue-50 text-blue-700',
  waiting_external: 'bg-amber-50 text-amber-700',
  paused_login_required: 'bg-amber-50 text-amber-700',
  paused_rate_limit: 'bg-amber-50 text-amber-700',
  completed: 'bg-emerald-50 text-emerald-700',
  completed_with_warnings: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

function SupportId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <button type="button" onClick={copy} className="font-mono text-[11px] text-gray-400 hover:text-gray-600" title="Copiar identificador completo">
      ID: {id.slice(0, 8)} {copied ? '(copiado!)' : ''}
    </button>
  );
}

function TaskRow({ task }: { task: SyncTask }) {
  const guidance = classifyTaskError(task);
  return (
    <li className="border-t border-gray-100 py-3 first:border-t-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-gray-800">{task.type}</p>
          <p className="text-xs text-gray-500">
            {task.source} {task.cnj ? `· ${task.cnj}` : ''} · prioridade {task.priority}
          </p>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASS[task.status]}`}>
          {STATUS_LABEL[task.status]}
        </span>
      </div>
      {task.error_message && <p className="mt-1 text-xs text-red-600">{task.error_message}</p>}
      {guidance && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 space-y-0.5">
          <p><strong>Causa:</strong> {guidance.causa}</p>
          <p><strong>Próximo passo:</strong> {guidance.proximoPasso}</p>
        </div>
      )}
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Tentativa {task.attempt} · criada {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(task.created_at))}
        </p>
        <SupportId id={task.id} />
      </div>
    </li>
  );
}

export default function QueuePage() {
  const { tasks, error, loading, refresh } = useTaskQueue();

  return (
    <AppShell
      title="Fila de tarefas"
      subtitle="Tarefas de sincronização (Mural, PDPJ) reservadas e executadas por este computador."
      actions={
        <button type="button" className="btn-secondary text-sm" onClick={() => void refresh()}>
          Atualizar
        </button>
      }
    >
      {error && <div className="card border-amber-200 bg-amber-50 text-amber-800 text-sm">{error}</div>}

      <div className="card">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-6">Carregando...</p>
        ) : tasks.length ? (
          <ul>{tasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>
        ) : (
          <div className="text-center py-8 space-y-1">
            <p className="text-sm text-gray-500">Nenhuma tarefa na fila ainda.</p>
            <p className="text-xs text-gray-400">
              Elas aparecem aqui quando o escritório tem OABs vinculadas e uma sincronização
              (Mural ou PDPJ) roda pela primeira vez.
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
