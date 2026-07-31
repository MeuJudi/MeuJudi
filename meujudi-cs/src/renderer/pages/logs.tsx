import { AppShell } from '@/components/AppShell';
import { LogsViewer } from '@/components/LogsViewer';

export default function LogsPage() {
  return (
    <AppShell
      title="Logs"
      subtitle="Últimos eventos técnicos do MeuJudi Sync, com segredos mascarados."
      actions={
        <button type="button" className="btn-secondary text-sm" onClick={() => window.meujudi.app.openLogsFolder()}>
          Abrir pasta de logs
        </button>
      }
    >
      <LogsViewer limit={200} />
    </AppShell>
  );
}
