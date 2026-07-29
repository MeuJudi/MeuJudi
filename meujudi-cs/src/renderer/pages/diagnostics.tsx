import { AppShell } from '@/components/AppShell';
import { DiagnosticViewer } from '@/components/DiagnosticViewer';

export default function DiagnosticsPage() {
  return (
    <AppShell title="Diagnóstico" subtitle="Verificação de rede, pareamento, sessão PDPJ, Mural e envio ao Supabase.">
      <DiagnosticViewer />
    </AppShell>
  );
}
