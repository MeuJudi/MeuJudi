/**
 * Página "Portal PDPJ/Jus" — conexão, sessão e extração.
 *
 * Rota-alvo de docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md (seção 8.7).
 * Substitui settings/pje-connection.tsx, que agora só redireciona pra cá.
 */

import { useState } from 'react';
import { usePdpjStatus } from '@/hooks/usePdpjStatus';
import { useTimeAgo, formatDateTime } from '@/hooks/useTimeAgo';
import { StatusIndicator } from '@/components/StatusIndicator';
import { AppShell } from '@/components/AppShell';

export default function PdpjSourcePage() {
  const { status, isLoading, error, connect, disconnect } = usePdpjStatus();
  const [showHelp, setShowHelp] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const isConnected = status.state === 'connected';
  const isConnecting = status.state === 'connecting' || isLoading;
  const session = isConnected ? status.session : null;

  const timeRemaining = useTimeAgo(session?.expiresAt);
  const apiTokenTimeRemaining = useTimeAgo(session?.apiTokenExpiresAt);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const progress = await window.meujudi.sync.now();
      if (progress.tasksTotal === 0) {
        alert('Nenhuma tarefa pendente na fila unificada no momento.');
      } else {
        alert(`Sincronização: ${progress.tasksCompleted} concluída(s), ${progress.tasksFailed} falhou(aram), ${progress.tasksPaused} pausada(s).`);
      }
    } finally {
      setSyncing(false);
    }
  };

  return (
    <AppShell title="Portal PDPJ/Jus" actions={<StatusIndicator status={status} size="lg" />}>
      {error && (
        <div className="card border-red-300 bg-red-50">
          <p className="text-red-700">❌ {error}</p>
        </div>
      )}

      {isConnected && session ? (
        <ConnectedCard
          session={session}
          timeRemaining={timeRemaining}
          apiTokenTimeRemaining={apiTokenTimeRemaining}
          onDisconnect={disconnect}
          onSyncNow={handleSyncNow}
          onOpenJus={() => window.meujudi.pdpj.openJus()}
          onValidateApi={() => window.meujudi.pdpj.validateApi()}
          isLoading={isLoading}
          syncing={syncing}
        />
      ) : (
        <DisconnectedCard
          isConnecting={isConnecting}
          onConnect={connect}
          onShowHelp={() => setShowHelp(true)}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </AppShell>
  );
}

function ConnectedCard({
  session,
  timeRemaining,
  apiTokenTimeRemaining,
  onDisconnect,
  onSyncNow,
  onOpenJus,
  onValidateApi,
  isLoading,
  syncing,
}: any) {
  // `apiStatus === 'validated'` só diz que existe um token salvo — não
  // diz se ele ainda é válido. O prazo de baixo (apiTokenExpiresAt) é o
  // que de fato importa pras tarefas do PDPJ; a sessão de cookies acima
  // dura bem mais (~7 dias) e não reflete isso.
  const apiTokenExpirado = session.apiTokenExpiresAt && new Date(session.apiTokenExpiresAt).getTime() <= Date.now();
  const apiRealmenteValidada = session.apiStatus === 'validated' && !apiTokenExpirado;

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-status-connected">✓ Conectado ao sistema</h2>
        <span className="text-sm text-gray-500">Origem: Jus.br / PDPJ</span>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">ID do usuário</p>
          <p className="font-mono text-base">{session.userId}</p>
        </div>
        <div>
          <p className="text-gray-500">Sessão (cookies) expira</p>
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

      <div className={`rounded-lg border p-3 text-sm ${apiRealmenteValidada ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        <strong>API PDPJ:</strong> {apiRealmenteValidada ? 'validada e pronta para extração' : apiTokenExpirado ? 'token expirado — renovando em segundo plano' : 'aguardando validação em segundo plano'}
        {session.apiTokenExpiresAt && (
          <span className="ml-2 text-xs opacity-80">(token {apiTokenTimeRemaining})</span>
        )}
      </div>

      <div className="border-t pt-4 flex flex-wrap gap-2">
        <button onClick={onSyncNow} disabled={isLoading || syncing} className="btn-primary">
          {syncing ? '🔄 Sincronizando...' : '🔄 Sincronizar agora'}
        </button>
        <button onClick={onDisconnect} disabled={isLoading} className="btn-danger">
          Desconectar
        </button>
        <button onClick={onOpenJus} className="btn-secondary">Abrir Jus.br</button>
        <button
          onClick={async () => {
            const validated = await onValidateApi();
            if (!validated) alert('A validação não foi concluída. Abra os logs para ver o motivo.');
          }}
          disabled={isLoading}
          className="btn-secondary"
        >
          Validar API agora
        </button>
      </div>
    </div>
  );
}

function DisconnectedCard({ isConnecting, onConnect, onShowHelp }: any) {
  return (
    <div className="card space-y-4">
      <h2 className="text-xl font-semibold">Não conectado</h2>
      <p className="text-gray-600">
        Para usar dados do PJe, precisamos que você faça login uma vez.
        Seus dados ficam salvos no seu computador, criptografados.
      </p>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
        💡 <strong>Como funciona:</strong> a janela abre no Jus.br (PDPJ) — o portal
        nacional que virou a porta de entrada oficial do PJe. Você faz login normal
        (gov.br ou cert. A1, com o código de segurança se for pedido), o MeuJudi Sync
        guarda os cookies criptografados e atualiza os dados automaticamente. Você não
        precisa fazer login de novo até a sessão expirar.
      </div>

      <div className="space-y-2">
        <button onClick={onConnect} disabled={isConnecting} className="btn-primary w-full">
          {isConnecting ? '🟡 Conectando...' : '🔌 Conectar (via PDPJ/Jus.br)'}
        </button>
        <button onClick={onShowHelp} className="btn-secondary w-full text-sm">
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold">Como funciona o login</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">×</button>
        </div>

        <div className="prose prose-sm max-w-none space-y-3 text-gray-700">
          <p>
            O MeuJudi Sync é um app separado que fica na bandeja do Windows (perto do relógio).
            Ele cuida de toda a parte de autenticação com o PJe, passando pelo Jus.br
            (PDPJ) — a porta de entrada nacional que o próprio PJe passou a exigir pra
            usuário externo.
          </p>

          <h3 className="font-semibold text-gray-900">Passo a passo:</h3>
          <ol className="list-decimal list-inside space-y-1">
            <li>Você clica em <strong>"Conectar (via PDPJ/Jus.br)"</strong> aqui</li>
            <li>Uma janela do Jus.br abre (dentro do MeuJudi Sync)</li>
            <li>Você faz login normal:
              <ul className="list-disc list-inside ml-6 mt-1 space-y-0.5">
                <li><strong>gov.br</strong>: CPF + senha (igual entrar no e-mail gov)</li>
                <li><strong>Cert. A1</strong>: seleciona seu certificado digital</li>
                <li>Se pedir, digite o <strong>código de segurança</strong> enviado por e-mail (2º fator, obrigatório desde 2025)</li>
              </ul>
            </li>
            <li>A janela fecha sozinha quando o login completar e o PJe te reconhecer</li>
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
            O MeuJudi Sync roda em background, invisível. A cada 1 hora, ele consulta o PJe
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
          <button onClick={onClose} className="btn-primary">Entendi</button>
        </div>
      </div>
    </div>
  );
}
