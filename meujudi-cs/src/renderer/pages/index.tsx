/**
 * Home do MeuJudi Sync — resumo de status + atalhos centralizados.
 *
 * Layout permanece centralizado (logo + card + lista de botões), só mais
 * organizado — ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 1.
 * Sem menu lateral, por decisão explícita.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePdpjStatus } from '@/hooks/usePdpjStatus';
import { usePairing } from '@/hooks/usePairing';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import { StatusIndicator } from '@/components/StatusIndicator';
import { UpdateButton } from '@/components/UpdateButton';

function NavButton({ href, icon, label, primary = false }: { href: string; icon: string; label: string; primary?: boolean }) {
  return (
    <Link href={href} className={`${primary ? 'btn-primary' : 'btn-secondary'} w-full justify-start`}>
      <span className="mr-1">{icon}</span>{label}
    </Link>
  );
}

export default function Home() {
  const { status, isLoading, connect } = usePdpjStatus();
  const { status: pairing } = usePairing();
  const connection = useConnectionStatus();

  const isConnected = status.state === 'connected';
  const session = isConnected ? status.session : null;
  // `session.expiresAt` é a sessão de cookies (~7 dias) — quase nunca é o
  // que expira de verdade. O que importa pras tarefas do PDPJ é o Bearer
  // (apiTokenExpiresAt, bem mais curto), e só reflete algo real quando a
  // API está de fato validada agora — sem isso, o Bearer pode ter sido
  // invalidado por um 401 (revalidação automática falhando) e o card
  // continuava mostrando uma contagem de dias, como se nada tivesse
  // acontecido (achado 04/08/2026, a pedido do Caio — mesma correção que a
  // tela de Diagnóstico do Portal PDPJ/Jus já tinha).
  const apiTokenExpirado = session?.apiTokenExpiresAt ? new Date(session.apiTokenExpiresAt).getTime() <= Date.now() : true;
  const apiRealmenteValidada = isConnected && session?.apiStatus === 'validated' && !apiTokenExpirado;
  const timeRemaining = useTimeAgo(session?.apiTokenExpiresAt);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const handleSyncNow = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const progress = await window.meujudi.sync.now();
      if (progress.tasksTotal === 0) {
        setSyncMessage('Nenhuma tarefa pendente na fila unificada no momento.');
      } else {
        const parts = [`${progress.tasksCompleted} concluída(s)`];
        if (progress.tasksFailed) parts.push(`${progress.tasksFailed} falhou(aram)`);
        if (progress.tasksPaused) parts.push(`${progress.tasksPaused} pausada(s)`);
        setSyncMessage(parts.join(' · '));
      }
    } catch (err: any) {
      setSyncMessage(err?.message || 'Não foi possível sincronizar agora.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        <div className="relative text-center">
          <h1 className="text-3xl font-bold text-primary-700">MeuJudi Sync</h1>
          <p className="text-gray-500 mt-1 text-sm">Sincronização do escritório com o MeuJudi</p>
          <div className="absolute left-0 top-0">
            <UpdateButton />
          </div>
        </div>

        {connection.revoked && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
            O pareamento deste computador foi revogado pelo escritório. Pareie novamente em "Pareamento".
          </div>
        )}

        <div className="card space-y-3">
          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-500">MeuJudi Web</span>
            <span className={`font-medium ${connection.online ? 'text-status-connected' : 'text-gray-400'}`}>
              {!connection.paired ? 'Não pareado' : connection.online ? 'Conectado' : 'Sem conexão'}
            </span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-500">Pareamento</span>
            <span className={`font-medium ${pairing ? 'text-status-connected' : 'text-gray-400'}`}>
              {pairing ? pairing.tenantName : 'Não pareado'}
            </span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-center justify-between text-sm py-1">
            <span className="text-gray-500">Portal PDPJ/Jus</span>
            <span className="flex items-center gap-2">
              <StatusIndicator status={status} size="sm" />
              {apiRealmenteValidada
                ? `expira ${timeRemaining}`
                : isConnected
                  ? 'revalidando sessão...'
                  : isLoading || status.state === 'connecting'
                    ? 'conectando...'
                    : 'desconectado'}
            </span>
          </div>
        </div>

        {syncMessage && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">{syncMessage}</div>
        )}

        <div className="flex flex-col gap-2">
          {!isConnected && (
            <button onClick={connect} disabled={isLoading} className="btn-primary w-full justify-center">
              🔌 Conectar agora
            </button>
          )}
          {isConnected && (
            <button onClick={handleSyncNow} disabled={syncing} className="btn-primary w-full justify-center">
              {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar agora'}
            </button>
          )}
          <NavButton href="/sources/pdpj/" icon="⚖️" label="Portal PDPJ/Jus" />
          <NavButton href="/sources/mural/" icon="📬" label="Mural" />
          <NavButton href="/queue/" icon="📋" label="Fila de tarefas" />
          <NavButton href="/settings/pairing/" icon="🔗" label="Pareamento" />
          <NavButton href="/settings/oab-validation/" icon="🛡️" label="Validação de OAB" />

          <div className="border-t border-gray-100 my-1" />

          <NavButton href="/diagnostics/" icon="🩺" label="Diagnóstico" />
          <NavButton href="/logs/" icon="📄" label="Logs" />
          <NavButton href="/about/" icon="ℹ️" label="Sobre" />
        </div>

        <p className="text-center text-xs text-gray-400">
          Tray app (Electron) — fica na bandeja do Windows
        </p>
      </div>
    </main>
  );
}
