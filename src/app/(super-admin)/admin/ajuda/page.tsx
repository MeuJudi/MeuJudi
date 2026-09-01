import { AdminReportList } from "@/components/admin/ajuda/admin-report-list";
import { getAllSupportReports, getTenantOptions } from "./actions";

export default async function AdminAjudaPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; tenant?: string }>;
}) {
  const params = await searchParams;
  const [reports, tenants] = await Promise.all([
    getAllSupportReports({
      status: params.status,
      reportType: params.type,
      tenantId: params.tenant,
    }),
    getTenantOptions(),
  ]);

  const statuses = {
    novo: reports.filter((r) => r.status === "novo").length,
    em_andamento: reports.filter((r) => r.status === "em_andamento").length,
    respondido: reports.filter((r) => r.status === "respondido").length,
    arquivado: reports.filter((r) => r.status === "arquivado").length,
    total: reports.length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Ajuda</h1>
        <p className="text-sm text-muted-foreground">
          Reports de bugs, sugestoes e duvidas dos clientes.
        </p>
      </div>
      <AdminReportList reports={reports} statuses={statuses} tenants={tenants} />
    </div>
  );
}
