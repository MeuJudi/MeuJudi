import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';

export default function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);
  const [checando, setChecando] = useState(false);

  useEffect(() => {
    void window.meujudi.app.getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

  async function verificarAtualizacao() {
    setChecando(true);
    try {
      await window.meujudi.app.checkForUpdates();
    } finally {
      // O resultado (achou/nao achou/erro) chega por notificacao do
      // Windows, disparada pelo auto-updater — nao tem retorno direto
      // aqui pra mostrar na tela.
      setTimeout(() => setChecando(false), 3000);
    }
  }

  return (
    <AppShell title="Sobre">
      <div className="card space-y-4 text-center">
        <div>
          <p className="text-xl font-semibold">MeuJudi Sync</p>
          <p className="text-sm text-gray-500">{version ? `Versão ${version}` : 'Consultando versão...'}</p>
        </div>
        <p className="text-sm text-gray-600">
          Sincronização do escritório com o MeuJudi — conexão PDPJ/Jus, Mural
          eletrônico, validação de OAB e diagnóstico técnico.
        </p>
        <div className="flex flex-col gap-2">
          <button onClick={verificarAtualizacao} disabled={checando} className="btn-secondary w-full text-sm">
            {checando ? 'Verificando...' : 'Verificar atualização'}
          </button>
          <button onClick={() => window.meujudi.app.openLogsFolder()} className="btn-secondary w-full text-sm">
            Abrir pasta de logs
          </button>
        </div>
      </div>
    </AppShell>
  );
}
