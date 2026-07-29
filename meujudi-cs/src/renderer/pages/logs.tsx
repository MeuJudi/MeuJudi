import { AppShell } from '@/components/AppShell';
import { LogsViewer } from '@/components/LogsViewer';

export default function LogsPage() {
  return (
    <AppShell title="Logs" subtitle="Últimos eventos técnicos do MeuJudi Sync, com segredos mascarados.">
      <LogsViewer limit={200} />
    </AppShell>
  );
}
