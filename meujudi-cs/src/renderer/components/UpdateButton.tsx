/**
 * UpdateButton — só aparece quando tem uma atualização já baixada e pronta
 * pra instalar. Clicar fecha o app e reabre já na versão nova
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
    <button onClick={handleInstall} disabled={installing} className="btn-primary w-full justify-center">
      {installing ? '🔄 Atualizando...' : `⬆️ Atualizar agora${update.version ? ` (v${update.version})` : ''}`}
    </button>
  );
}
