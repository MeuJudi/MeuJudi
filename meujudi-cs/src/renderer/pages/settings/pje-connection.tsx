/**
 * Página de Configurações — Diagnóstico completo.
 *
 * Mostra o último relatório + permite executar novo + enviar pro Supabase.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePJeStatus } from '@/hooks/usePJeStatus';
import { useTimeAgo, formatDateTime } from '@/hooks/useTimeAgo';
import { StatusIndicator } from '@/components/StatusIndicator';
import { DiagnosticViewer } from '@/components/DiagnosticViewer';
import { LogsViewer } from '@/components/LogsViewer';

export default function PJeConnectionPage() {
  const { status, isLoading, error, connect, disconnect, syncNow } = usePJeStatus();
  const [showLogs, setShowLogs] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const isConnected = status.state === 'connected';
  const isConnecting = status.state === 'connecting' || isLoading;
  const session = isConnected ? status.session : null;

  const timeRemaining = useTimeAgo(session?.expiresAt);

  const handleSyncNow = async () => {
    const result = await syncNow();
    if (result) {
      alert(`Sincronização concluída!\n${result.processos} processos atualizados em ${(result.durationMs / 1000).toFixed(1)}s`);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
              ← Voltar
            </Link>
            <h1 className="text-3xl font-bold mt-1">Conexão com PJe</h1>
          </div>
          <StatusIndicator status={status} size="lg" />
        </header>

        {/* Erro global */}
        {error && (
          <div className="card border-red-300 bg-red-50">
            <p className="text-red-700">❌ {error}</p>
          </div>
        )}

        {/* Card principal — muda conforme status */}
        {isConnected && session ? (
          <ConnectedCard
            session={session}
            timeRemaining={timeRemaining}
            onDisconnect={disconnect}
            onSyncNow={handleSyncNow}
            isLoading={isLoading}
          />
        ) : (
          <DisconnectedCard
            isConnecting={isConnecting}
            onConnect={connect}
            onShowHelp={() => setShowHelp(true)}
          />
        )}

        {/* Diagnóstico */}
        <DiagnosticViewer />

        {/* Logs (toggle) */}
        <div>
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="btn-secondary text-sm mb-2"
          >
            {showLogs ? '▼' : '▶'} {showLogs ? 'Ocultar' : 'Mostrar'} logs
          </button>
          {showLogs && <LogsViewer limit={50} />}
        </div>

        {/* Modal de ajuda */}
        {showHelp && (
          <HelpModal onClose={() => setShowHelp(false)} />
        )}
      </div>
    </main>
  );
}

function ConnectedCard({
  session,
  timeRemaining,
  onDisconnect,
  onSyncNow,
  isLoading,
}: any) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-status-connected">✓ Conectado</h2>
        <span className="text-sm text-gray-500">Tribunal: {session.tribunal.toUpperCase()}</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">ID do usuário</p>
          <p className="font-mono text-base">{session.userId}</p>
        </div>
        <div>
          <p className="text-gray-500">Expira</p>
          <p className="font-mono text-base">{timeRemaining}</p>
        </div>
        <div>
          <p className="text-gray-500">Sessão criada em</p>
          <p className="font-mono text-base">{formatDateTime(session.createdAt)}</p>
        </div>
        <div>
          <p className="text-gray-500">Última atividade</p>
          <p className="font-mono text-base">{formatDateTime(session.lastUsedAt)}</p>
        </div>
      </div>

      <div className="border-t pt-4 flex flex-wrap gap-2">
        <button onClick={onSyncNow} disabled={isLoading} className="btn-primary">
          🔄 Sincronizar agora
        </button>
        <button
          onClick={onDisconnect}
          disabled={isLoading}
          className="btn-danger"
        >
          Desconectar
        </button>
      </div>
    </div>
  );
}

function DisconnectedCard({
  isConnecting,
  onConnect,
  onShowHelp,
}: any) {
  return (
    <div className="card space-y-4">
      <h2 className="text-xl font-semibold">Não conectado</h2>
      <p className="text-gray-600">
        Para usar dados do PJe, precisamos que você faça login uma vez.
        Seus dados ficam salvos no seu computador, criptografados.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        💡 <strong>Como funciona:</strong> você faz login no PJe (gov.br ou cert. A1),
        o MeuJudi CS guarda os cookies criptografados e atualiza os dados automaticamente.
        Você não precisa fazer login de novo até a sessão expirar.
      </div>

      <div className="space-y-2">
        <button
          onClick={onConnect}
          disabled={isConnecting}
          className="btn-primary w-full"
        >
          {isConnecting ? '🟡 Conectando...' : '🔌 Conectar com PJe'}
        </button>
        <button
          onClick={onShowHelp}
          className="btn-secondary w-full text-sm"
        >
          ❓ Como funciona o login?
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Após conectar, o app atualiza em background. Tempo de login: ~30 segundos.
      </p>
    </div>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Como funciona o login</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
            ×
          </button>
        </div>

        <div className="prose prose-sm max-w-none space-y-3 text-gray-700">
          <p>
            O MeuJudi CS é um app separado que fica na bandeja do Windows (perto do relógio).
            Ele cuida de toda a parte de autenticação com o PJe, usando seu cert. A1 ou gov.br.
          </p>

          <h3 className="font-semibold text-gray-900">Passo a passo:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Você clica em <strong>"Conectar com PJe"</strong> aqui</li>
            <li>Uma janela do PJe abre (dentro do MeuJudi CS)</li>
            <li>Você faz login normal:
              <ul className="list-disc list-inside ml-6 mt-1 space-y-0.5">
                <li><strong>gov.br</strong>: CPF + senha (igual entrar no e-mail gov)</li>
                <li><strong>Cert. A1</strong>: seleciona seu certificado digital</li>
              </ul>
            </li>
            <li>A janela fecha sozinha quando o login completar</li>
            <li>Você volta pra cá e vê "● Conectado"</li>
          </ol>

          <h3 className="font-semibold text-gray-900">Popup do cert. A1 (Windows)</h3>
          <p>
            Na primeira vez, o Windows vai mostrar um popup pedindo pra escolher o cert.
            Selecione seu e-CPF A1 e marque "Sempre usar este certificado" (se aparecer essa opção).
            Nas próximas vezes, pula direto.
          </p>

          <h3 className="font-semibold text-gray-900">E depois?</h3>
          <p>
            O MeuJudi CS roda em background, invisível. A cada 1 hora, ele consulta o PJe
            automaticamente e atualiza os processos do escritório. Você só precisa
            reconectar quando a sessão expirar (geralmente 1x a cada 8-24h).
          </p>

          <h3 className="font-semibold text-gray-900">Segurança (LGPD)</h3>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Seus cookies ficam <strong>criptografados</strong> no seu PC (AES-256)</li>
            <li>A chave de criptografia é única por máquina</li>
            <li>Nenhum dado sensível vai pra nuvem sem criptografia adicional</li>
            <li>Você pode desconectar e deletar os dados a qualquer momento</li>
          </ul>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn-primary">
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
