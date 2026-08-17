/**
 * UpdateButton — só aparece quando tem uma atualização já baixada e pronta
 * pra instalar. Fica só como um ícone de baixar; passar o mouse expande e
 * revela o texto; clicar fecha o app e reabre já na versão nova
 * (`autoUpdater.quitAndInstall()`), sem precisar esperar o próximo
 * reinício natural do Sync.
 */

import { useState } from 'react';
import { useUpdateStatus } from '@/hooks/useUpdateStatus';

export function UpdateButton() {
  const update = useUpdateStatus();
  const [installing, setInstalling] = useState(false);

  if (update.status !== 'ready') return null;

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await window.meujudi.app.installUpdate();
    } catch {
      setInstalling(false);
    }
    // Se tudo der certo o app fecha sozinho aqui — não tem "finally" útil.
  };

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={installing}
      title={`Atualizar agora${update.version ? ` (v${update.version})` : ''}`}
      className="group flex h-9 items-center overflow-hidden rounded-full bg-primary-600 text-white transition-shadow duration-300 hover:shadow-md disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center text-base">
        {installing ? '🔄' : '📥'}
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-sm font-medium opacity-0 transition-all duration-300 ease-out group-hover:max-w-[220px] group-hover:pr-4 group-hover:opacity-100">
        {installing ? 'Atualizando...' : `Atualizar agora${update.version ? ` (v${update.version})` : ''}`}
      </span>
    </button>
  );
}
