import { AlertTriangle, CheckCircle2, Clock3, MonitorCog, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";

type RecentLog = {
  timestamp?: string;
  level?: string;
  message?: string;
};

type DiagnosticEvent = {
  timestamp?: string;
  name?: string;
  status?: string;
  message?: string;
  durationMs?: number;
  details?: Record<string, unknown>;
};

type DiagnosticReportJson = {
  errors?: string[];
  warnings?: string[];
  recommendations?: string[];
  recentLogs?: RecentLog[];
  recentEvents?: DiagnosticEvent[];
  probableCause?: string;
  nextAction?: string;
  technicalSummary?: Record<string, unknown>;
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
  const latestEvents = latest?.report_json?.recentEvents?.slice(-24).reverse() ?? [];
  const latestLogs = latest?.report_json?.recentLogs?.slice(-12).reverse() ?? [];
  const technicalSummary = latest?.report_json?.technicalSummary;

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

      {latest ? (
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <Card>
            <CardHeader>
              <CardTitle>Diagnostico mais recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="font-medium text-foreground">Causa provavel</p>
                <p className="mt-1 text-muted-foreground">
                  {latest.report_json?.probableCause ?? latest.last_error ?? "Nao identificado."}
                </p>
              </div>
              <div>
                <p className="font-medium text-foreground">Proxima acao</p>
                <p className="mt-1 text-muted-foreground">
                  {latest.report_json?.nextAction ?? "Abrir logs e revisar o fluxo de login."}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Sessao</p>
                  <p className="mt-1 font-medium">{boolLabel(latest.cookies_has_session)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">XSRF</p>
                  <p className="mt-1 font-medium">{boolLabel(latest.cookies_has_xsrf)}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Eventos</p>
                  <p className="mt-1 font-medium">{latestEvents.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resumo tecnico</CardTitle>
            </CardHeader>
            <CardContent>
              {!technicalSummary ? (
                <p className="text-sm text-muted-foreground">Esse relatorio ainda nao trouxe resumo tecnico.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                  {Object.entries(technicalSummary).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-muted-foreground">{key}</dt>
                      <dd className="mt-1 break-words font-mono text-foreground">
                        {Array.isArray(value) ? value.join(", ") : String(value ?? "-")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
        </section>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Timeline do ultimo relatorio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {latestEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento estruturado enviado nesse relatorio.</p>
          ) : (
            latestEvents.map((event, index) => (
              <div key={`${event.timestamp}-${event.name}-${index}`} className="rounded-md border bg-background px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant={event.status === "error" ? "destructive" : "outline"}>
                    {event.status ?? "info"}
                  </Badge>
                  <span className="font-medium text-foreground">{event.name ?? "evento"}</span>
                  <span>{event.timestamp ? new Date(event.timestamp).toLocaleString("pt-BR") : "-"}</span>
                  {typeof event.durationMs === "number" ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {event.durationMs}ms
                    </span>
                  ) : null}
                </div>
                {event.message ? <p className="mt-2 text-foreground">{event.message}</p> : null}
                {event.details ? (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted p-2 font-mono text-[11px] text-muted-foreground">
                    {JSON.stringify(event.details, null, 2)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
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
