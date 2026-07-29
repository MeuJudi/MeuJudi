import { useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';

export default function AboutPage() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    void window.meujudi.app.getVersion().then(setVersion).catch(() => setVersion(null));
  }, []);

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
        <button onClick={() => window.meujudi.app.openLogsFolder()} className="btn-secondary w-full text-sm">
          Abrir pasta de logs
        </button>
      </div>
    </AppShell>
  );
}
