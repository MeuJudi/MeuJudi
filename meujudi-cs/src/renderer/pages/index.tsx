/**
 * Home page do MeuJudi CS.
 * Mostra status rápido + atalhos principais.
 */

import { usePJeStatus } from '@/hooks/usePJeStatus';
import { useTimeAgo } from '@/hooks/useTimeAgo';
import { StatusIndicator } from '@/components/StatusIndicator';

export default function Home() {
  const { status, isLoading, connect } = usePJeStatus();
  const isConnected = status.state === 'connected';
  const session = isConnected ? status.session : null;
  const timeRemaining = useTimeAgo(session?.expiresAt);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6">
        {/* Logo + título */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-primary-700">MeuJudi CS</h1>
          <p className="text-gray-500 mt-1">Cert Service</p>
        </div>

        {/* Status card */}
        <div className="card space-y-4">
          <div className="flex items-center justify-center gap-2">
            <StatusIndicator status={status} size="lg" />
          </div>

          {isConnected && session ? (
            <div className="text-center text-sm text-gray-600">
              <p>Tribunal: <strong>{session.tribunal.toUpperCase()}</strong></p>
              <p>Expira {timeRemaining}</p>
            </div>
          ) : (
            <p className="text-center text-sm text-gray-500">
              {status.state === 'connecting' || isLoading
                ? 'Conectando...'
                : 'App em background. Use o ícone da bandeja para abrir.'}
            </p>
          )}

          <div className="flex flex-col gap-2">
            <a href="settings/pje-connection/index.html" className="btn-primary w-full">
              ⚙️ Configurações de conexão
            </a>
            <a href="settings/pairing/index.html" className="btn-secondary w-full">
              🔗 Conectar ao MeuJudi Web
            </a>
            {!isConnected && (
              <button onClick={connect} disabled={isLoading} className="btn-secondary w-full">
                🔌 Conectar agora
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="text-center text-xs text-gray-400">
          <p>MeuJudi CS v0.1.0</p>
          <p className="mt-1">Tray app (Electron) — fica na bandeja do Windows</p>
        </div>
      </div>
    </main>
  );
}
