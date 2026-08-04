import { useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useTaskBatches, useBatchTasks } from '@/hooks/useTaskQueue';
import { classifyTaskError } from '@/lib/classify-task-error';
import type { SyncTask, TaskBatch } from '@shared/types';

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

const TYPE_LABEL: Record<string, string> = {
  pdpj_oab: 'Descoberta de processo novo (OAB)',
  pdpj_cnj: 'Detalhe e documentos do processo',
  mural_request: 'Consulta ao Mural',
  mural_push: 'Push do Mural',
  mural_sweep: 'Varredura de segurança do Mural',
  mural_historical: 'Importação histórica do Mural',
};

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type;
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

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
          <p className="font-medium text-gray-800">{typeLabel(task.type)}</p>
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
          Tentativa {task.attempt} · criada {formatDateTime(task.created_at)}
        </p>
        <SupportId id={task.id} />
      </div>
    </li>
  );
}

function BatchDetails({ batchKey }: { batchKey: string }) {
  const { tasks, loading, error } = useBatchTasks(batchKey);
  if (loading) return <p className="py-4 text-center text-sm text-gray-400">Carregando...</p>;
  if (error) return <p className="py-4 text-center text-sm text-red-600">{error}</p>;
  if (tasks.length === 0) return <p className="py-4 text-center text-sm text-gray-400">Nenhuma tarefa encontrada.</p>;
  return <ul className="mt-2">{tasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>;
}

function BatchCard({ batch }: { batch: TaskBatch }) {
  const [expanded, setExpanded] = useState(false);
  const pending = Math.max(0, batch.total - batch.done - batch.failed - batch.paused);
  const percent = batch.total > 0 ? Math.round((batch.done / batch.total) * 100) : 0;
  const temAtencao = batch.failed > 0 || batch.paused > 0;

  return (
    <div className="card">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="flex-1">
          <p className="font-medium text-gray-800">{typeLabel(batch.type)}</p>
          <p className="text-xs text-gray-500">
            {batch.source} · criado {formatDateTime(batch.created_at)} · {batch.total} {batch.total === 1 ? 'tarefa' : 'tarefas'}
          </p>
          {batch.type === 'pdpj_oab' && batch.done > 0 && (
            <p className={`mt-1 text-xs font-medium ${batch.novos_processos > 0 ? 'text-emerald-700' : 'text-gray-500'}`}>
              {batch.novos_processos > 0
                ? `🆕 ${batch.novos_processos} processo${batch.novos_processos === 1 ? '' : 's'} novo${batch.novos_processos === 1 ? '' : 's'} encontrado${batch.novos_processos === 1 ? '' : 's'}`
                : 'Nenhum processo novo encontrado'}
            </p>
          )}
          {batch.total > 1 && (
            <div className="mt-2">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
                <span>✅ {batch.done} concluída{batch.done === 1 ? '' : 's'}</span>
                <span>⏳ {pending} pendente{pending === 1 ? '' : 's'}</span>
                {batch.paused > 0 && <span className="text-amber-700">⚠️ {batch.paused} pausada{batch.paused === 1 ? '' : 's'}</span>}
                {batch.failed > 0 && <span className="text-red-700">❌ {batch.failed} falhou{batch.failed === 1 ? '' : 'aram'}</span>}
              </div>
            </div>
          )}
        </div>
        {batch.total === 1 ? (
          <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${batch.done ? STATUS_CLASS.completed : temAtencao ? STATUS_CLASS.paused_rate_limit : STATUS_CLASS.pending}`}>
            {batch.done ? 'Concluída' : temAtencao ? 'Precisa de atenção' : 'Pendente'}
          </span>
        ) : (
          temAtencao && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Precisa de atenção</span>
          )
        )}
        <span className="shrink-0 text-gray-400">{expanded ? '▴' : '▾'}</span>
      </button>
      {expanded && <BatchDetails batchKey={batch.batch_key} />}
    </div>
  );
}

export default function QueuePage() {
  const { batches, error, loading, refresh } = useTaskBatches();

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

      {loading ? (
        <div className="card">
          <p className="text-center text-sm text-gray-400 py-6">Carregando...</p>
        </div>
      ) : batches.length ? (
        <div className="space-y-3">{batches.map((batch) => <BatchCard key={batch.batch_key} batch={batch} />)}</div>
      ) : (
        <div className="card text-center py-8 space-y-1">
          <p className="text-sm text-gray-500">Nenhuma tarefa na fila ainda.</p>
          <p className="text-xs text-gray-400">
            Elas aparecem aqui quando o escritório tem OABs vinculadas e uma sincronização
            (Mural ou PDPJ) roda pela primeira vez.
          </p>
        </div>
      )}
    </AppShell>
  );
}
