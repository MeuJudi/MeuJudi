import { AppShell } from '@/components/AppShell';
import { DiagnosticViewer } from '@/components/DiagnosticViewer';
import { PdpjConcurrencyPanel } from '@/components/PdpjConcurrencyPanel';

export default function DiagnosticsPage() {
  return (
    <AppShell title="Diagnóstico" subtitle="Verificação de rede, pareamento, sessão PDPJ, Mural e envio ao Supabase.">
      <PdpjConcurrencyPanel />
      <DiagnosticViewer />
    </AppShell>
  );
}
