import { AlertTriangle, CheckCircle2, MonitorCog, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";

type RecentLog = {
  timestamp?: string;
  level?: string;
  message?: string;
};

type DiagnosticReportJson = {
  errors?: string[];
  warnings?: string[];
  recommendations?: string[];
  recentLogs?: RecentLog[];
};

type DiagnosticReportRow = {
  id: string;
  created_at: string;
  hostname: string | null;
  trigger_reason: string | null;
  overall_success: boolean;
  total_errors: number;
  total_warnings: number;
  recent_logs_count: number | null;
  last_error: string | null;
  cert_a1_found: boolean;
  pje_reachable: boolean | null;
  pje_login_succeeded: boolean | null;
  cookies_has_session: boolean | null;
  cookies_has_xsrf: boolean | null;
  report_json: DiagnosticReportJson | null;
};

function statusBadge(report: DiagnosticReportRow) {
  if (report.overall_success) {
    return <Badge variant="default">OK</Badge>;
  }

  if (report.total_errors > 0) {
    return <Badge variant="destructive">Erro</Badge>;
  }

  return <Badge variant="secondary">Aviso</Badge>;
}

function boolLabel(value: boolean | null) {
  if (value === true) return "Sim";
  if (value === false) return "Nao";
  return "-";
}

export default async function CsDiagnosticsPage() {
  const { supabase } = await requireSuperAdmin();
  const { data, error } = await supabase
    .from("diagnostic_reports")
    .select(
      "id, created_at, hostname, trigger_reason, overall_success, total_errors, total_warnings, recent_logs_count, last_error, cert_a1_found, pje_reachable, pje_login_succeeded, cookies_has_session, cookies_has_xsrf, report_json",
    )
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    throw new Error(error.message);
  }

  const reports = (data ?? []) as DiagnosticReportRow[];
  const latest = reports[0];
  const latestLogs = latest?.report_json?.recentLogs?.slice(-12).reverse() ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Diagnosticos do CS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Relatorios enviados pelo MeuJudi CS durante testes, falhas de login e diagnosticos manuais.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <MonitorCog className="h-5 w-5 text-primary" />
            <CardTitle>Total recente</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{reports.length}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <XCircle className="h-5 w-5 text-destructive" />
            <CardTitle>Com erro</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {reports.filter((report) => report.total_errors > 0).length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CheckCircle2 className="h-5 w-5 text-primary" />
            <CardTitle>Cert. A1 detectado</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">
            {reports.filter((report) => report.cert_a1_found).length}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <AlertTriangle className="h-5 w-5 text-primary" />
            <CardTitle>Ultimo motivo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm font-medium">{latest?.trigger_reason ?? "-"}</CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Relatorios recebidos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-3 pr-4 font-medium">Quando</th>
                <th className="py-3 pr-4 font-medium">PC</th>
                <th className="py-3 pr-4 font-medium">Motivo</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">A1</th>
                <th className="py-3 pr-4 font-medium">PJe</th>
                <th className="py-3 pr-4 font-medium">Login</th>
                <th className="py-3 pr-4 font-medium">XSRF</th>
                <th className="py-3 pr-4 font-medium">Logs</th>
                <th className="py-3 pr-4 font-medium">Ultimo erro</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b align-top last:border-0">
                  <td className="py-3 pr-4 text-muted-foreground">
                    {new Date(report.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{report.hostname ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{report.trigger_reason ?? "manual"}</Badge>
                  </td>
                  <td className="py-3 pr-4">{statusBadge(report)}</td>
                  <td className="py-3 pr-4">{boolLabel(report.cert_a1_found)}</td>
                  <td className="py-3 pr-4">{boolLabel(report.pje_reachable)}</td>
                  <td className="py-3 pr-4">{boolLabel(report.pje_login_succeeded)}</td>
                  <td className="py-3 pr-4">{boolLabel(report.cookies_has_xsrf)}</td>
                  <td className="py-3 pr-4">{report.recent_logs_count ?? 0}</td>
                  <td className="max-w-md py-3 pr-4 text-xs text-muted-foreground">
                    {report.last_error ?? report.report_json?.errors?.[0] ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs recentes do ultimo relatorio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {latestLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum log recente enviado nesse relatorio.</p>
          ) : (
            latestLogs.map((log, index) => (
              <div key={`${log.timestamp}-${index}`} className="rounded-md border bg-background px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant="outline">{log.level ?? "info"}</Badge>
                  <span>{log.timestamp ? new Date(log.timestamp).toLocaleString("pt-BR") : "-"}</span>
                </div>
                <p className="mt-2 font-mono">{log.message ?? "-"}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
