import { AppShell } from '@/components/AppShell';
import { LogsViewer } from '@/components/LogsViewer';
import { SendLogsPanel } from '@/components/SendLogsPanel';

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
      <div className="space-y-4">
        <SendLogsPanel />
        <LogsViewer limit={200} />
      </div>
    </AppShell>
  );
}
