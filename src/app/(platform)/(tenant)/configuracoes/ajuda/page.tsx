import { AjudaForm } from "@/components/tenant/ajuda/ajuda-form";
import { AjudaReportList } from "@/components/tenant/ajuda/ajuda-report-list";
import { getMySupportReports } from "./actions";

export default async function AjudaPage() {
  const reports = await getMySupportReports();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">Ajuda</h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Encontrou um erro, tem uma sugestao ou duvida? Conta pra gente.
        </p>
      </div>

      <AjudaForm />

      {reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-card-foreground)]">Meus reports anteriores</h3>
          <AjudaReportList reports={reports} />
        </div>
      )}
    </div>
  );
}
