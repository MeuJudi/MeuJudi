import { AppShell } from '@/components/AppShell';
import { MuralProgressPanel } from '@/components/MuralProgressPanel';

export default function MuralSourcePage() {
  return (
    <AppShell title="Mural" subtitle="Comunicações recebidas via Mural Eletrônico do PJe, atendidas pelo CS.">
      <MuralProgressPanel />
    </AppShell>
  );
}
