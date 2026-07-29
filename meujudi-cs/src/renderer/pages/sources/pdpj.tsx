/**
 * Página "Portal PDPJ/Jus" — conexão, sessão e extração.
 *
 * Rota-alvo de docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md (seção 8.7).
 * Substitui settings/pje-connection.tsx, que agora só redireciona pra cá.
 */

import { useEffect, useState } from 'react';
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
  onDisconnect,
  onSyncNow,
  onOpenJus,
  onValidateApi,
  isLoading,
  syncing,
}: any) {
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

      <div className={`rounded-lg border p-3 text-sm ${session.apiStatus === 'validated' ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
        <strong>API PDPJ:</strong> {session.apiStatus === 'validated' ? 'validada e pronta para extracao' : 'aguardando validacao em segundo plano'}
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

      <PdpjExtractionPanel />
    </div>
  );
}

function PdpjExtractionPanel() {
  const [oabs, setOabs] = useState<Array<{ oabNumber: string; oabUf: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void window.meujudi.pdpj.getLinkedOabs().then(setOabs).catch((error) => setMessage(error?.message || 'Nao foi possivel carregar as OABs vinculadas.'));
  }, []);

  const start = async () => {
    const linked = oabs[0];
    if (!linked) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await window.meujudi.pdpj.enqueueOabSync(linked.oabNumber, linked.oabUf);
      setMessage(
        result.created
          ? 'Sincronização enfileirada. Acompanhe o andamento em "Fila de tarefas" — CNJs novos aparecem lá conforme forem descobertos.'
          : 'Não foi possível enfileirar a sincronização.',
      );
    } catch (error: any) {
      setMessage(error?.message || 'Nao foi possivel enfileirar a sincronizacao.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-t pt-4 space-y-3">
      <div>
        <h3 className="font-semibold">Sincronização de processos pelo PDPJ</h3>
        <p className="text-sm text-gray-500">
          A OAB vem automaticamente do escritório pareado. A varredura roda em segundo plano pela
          fila de tarefas — nada fica salvo localmente neste computador.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {oabs.length ? oabs.map((item) => `${item.oabNumber}/${item.oabUf}`).join(', ') : 'Nenhuma OAB vinculada encontrada'}
        </div>
        <button onClick={start} disabled={busy || !oabs.length} className="btn-primary">{busy ? 'Enfileirando...' : 'Sincronizar OAB vinculada'}</button>
      </div>
      {message && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800 break-words">{message}</p>}
      <PdpjCnjTestPanel />
    </section>
  );
}

const TEST_CNJS = [
  '0005245-63.2026.8.16.0000',
  '0003592-62.2026.8.16.0182',
  '0018631-46.2015.8.16.0001',
];

function findUrls(value: unknown, urls: string[] = [], depth = 0, path = ''): string[] {
  if (depth > 6 || urls.length >= 20) return urls;
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
    if (!urls.includes(value)) urls.push(value);
  } else if (typeof value === 'string' && /^\/processos\//i.test(value) && /href|document|arquivo/i.test(path)) {
    const absoluteUrl = `https://portaldeservicos.pdpj.jus.br/api/v2${value}`;
    if (!urls.includes(absoluteUrl)) urls.push(absoluteUrl);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => findUrls(item, urls, depth + 1, `${path}[${index}]`));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => findUrls(item, urls, depth + 1, path ? `${path}.${key}` : key));
  }
  return urls;
}

function PdpjCnjTestPanel() {
  const [results, setResults] = useState<Record<string, Record<string, unknown> | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const search = async (cnj: string) => {
    setBusy(cnj);
    setErrors((current) => ({ ...current, [cnj]: '' }));
    try {
      const details = await window.meujudi.pdpj.fetchProcessDetails(cnj);
      setResults((current) => ({ ...current, [cnj]: details }));
    } catch (error: any) {
      setErrors((current) => ({ ...current, [cnj]: error?.message || 'Falha ao consultar o processo.' }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div>
        <h4 className="font-semibold text-amber-950">Teste de detalhe e documentos PDPJ</h4>
        <p className="text-sm text-amber-900">Consulta individual pelo navegador autenticado do CS. Os resultados ficam somente nesta tela durante o teste.</p>
      </div>
      <div className="space-y-2">
        {TEST_CNJS.map((cnj) => {
          const details = results[cnj];
          const urls = details ? findUrls(details) : [];
          return (
            <div key={cnj} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <code className="text-sm text-gray-800">{cnj}</code>
                <button onClick={() => void search(cnj)} disabled={busy !== null} className="btn-secondary text-sm">
                  {busy === cnj ? 'Consultando...' : 'Consultar detalhe'}
                </button>
              </div>
              {errors[cnj] && <p className="text-sm text-red-700">{errors[cnj]}</p>}
              {details && (
                <div className="text-xs text-gray-700 space-y-1">
                  <p><strong>Campos retornados:</strong> {Object.keys(details).sort().join(', ') || 'nenhum'}</p>
                  <p><strong>URLs encontradas:</strong> {urls.length}</p>
                  {urls.length > 0 && <ul className="list-disc pl-5 break-all">{urls.map((url) => <li key={url}><a className="text-blue-700 underline" href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>}
                  <details>
                    <summary className="cursor-pointer text-blue-700">Ver resposta técnica</summary>
                    <pre className="mt-2 max-h-72 overflow-auto rounded bg-gray-100 p-2 text-[10px]">{JSON.stringify(details, null, 2)}</pre>
                  </details>
                </div>
              )}
            </div>
          );
        })}
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
