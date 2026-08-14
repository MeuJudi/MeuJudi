import { AlertTriangle, CheckCircle2, Clock3, MonitorCog, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { toggleDeviceLogUpload } from "./actions";

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

type SyncTaskFailureRow = {
  id: string;
  tenant_id: string;
  source: string;
  type: string;
  status: string;
  attempt: number;
  error_code: string | null;
  error_message: string | null;
  last_activity_at: string | null;
  created_at: string;
  tenants: { name: string | null } | null;
};

type CsDeviceRow = {
  id: string;
  device_name: string | null;
  hostname: string | null;
  last_heartbeat: string | null;
  log_upload_enabled: boolean;
  tenants: { name: string | null } | null;
};

type CsLogUploadRow = {
  id: string;
  device_id: string;
  period_start: string;
  period_end: string;
  entry_count: number;
  entries: { timestamp?: string; level?: string; message?: string; context?: unknown }[] | null;
  created_at: string;
  cs_devices: { device_name: string | null } | null;
  tenants: { name: string | null } | null;
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

function taskStatusLabel(status: string): string {
  if (status === "failed") return "Falhou";
  if (status === "paused_login_required") return "Pausada — login";
  if (status === "paused_rate_limit") return "Pausada — limite";
  return status;
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

  // Fase 9 (docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md): observabilidade
  // da fila unificada (sync_tasks) — falhas/pausas recentes de qualquer
  // tenant, pra triagem de suporte sem precisar entrar em cada escritório.
  const { data: taskFailures } = await supabase
    .from("sync_tasks")
    .select("id, tenant_id, source, type, status, attempt, error_code, error_message, last_activity_at, created_at, tenants(name)")
    .in("status", ["failed", "paused_login_required", "paused_rate_limit"])
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(30)
    .returns<SyncTaskFailureRow[]>();

  const { data: devices } = await supabase
    .from("cs_devices")
    .select("id, device_name, hostname, last_heartbeat, log_upload_enabled, tenants(name)")
    .is("revoked_at", null)
    .order("last_heartbeat", { ascending: false, nullsFirst: false })
    .returns<CsDeviceRow[]>();

  const { data: logUploads } = await supabase
    .from("cs_log_uploads")
    .select("id, device_id, period_start, period_end, entry_count, entries, created_at, cs_devices(device_name), tenants(name)")
    .order("created_at", { ascending: false })
    .limit(15)
    .returns<CsLogUploadRow[]>();

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
          Relatorios enviados pelo MeuJudi Sync durante testes, falhas de login e diagnosticos manuais.
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
          <CardTitle>Fila unificada — falhas e pausas recentes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!taskFailures || taskFailures.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa falhada ou pausada nos ultimos registros.</p>
          ) : (
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">Quando</th>
                  <th className="py-3 pr-4 font-medium">Escritorio</th>
                  <th className="py-3 pr-4 font-medium">Fonte / tipo</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Tentativa</th>
                  <th className="py-3 pr-4 font-medium">Erro</th>
                  <th className="py-3 pr-4 font-medium">ID (suporte)</th>
                </tr>
              </thead>
              <tbody>
                {taskFailures.map((task) => (
                  <tr key={task.id} className="border-b align-top last:border-0">
                    <td className="py-3 pr-4 text-muted-foreground">
                      {task.last_activity_at ? new Date(task.last_activity_at).toLocaleString("pt-BR") : new Date(task.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="py-3 pr-4">{task.tenants?.name ?? "-"}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{task.source}:{task.type}</td>
                    <td className="py-3 pr-4">
                      <Badge variant={task.status === "failed" ? "destructive" : "secondary"}>{taskStatusLabel(task.status)}</Badge>
                    </td>
                    <td className="py-3 pr-4">{task.attempt}</td>
                    <td className="max-w-md py-3 pr-4 text-xs text-muted-foreground">{task.error_message ?? task.error_code ?? "-"}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">{task.id.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Envio de logs sob demanda — liberacao por dispositivo</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <p className="mb-3 text-sm text-muted-foreground">
            Desligado por padrao. So libere pro dispositivo especifico que voce precisa investigar — o botao de enviar so aparece no Sync daquele PC enquanto estiver ligado aqui.
          </p>
          {!devices || devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum dispositivo pareado.</p>
          ) : (
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">Dispositivo</th>
                  <th className="py-3 pr-4 font-medium">Escritorio</th>
                  <th className="py-3 pr-4 font-medium">Ultimo heartbeat</th>
                  <th className="py-3 pr-4 font-medium">Envio de logs</th>
                  <th className="py-3 pr-4 font-medium" />
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b align-top last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">{device.device_name ?? device.hostname ?? device.id.slice(0, 8)}</td>
                    <td className="py-3 pr-4">{device.tenants?.name ?? "-"}</td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {device.last_heartbeat ? new Date(device.last_heartbeat).toLocaleString("pt-BR") : "-"}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge variant={device.log_upload_enabled ? "default" : "secondary"}>
                        {device.log_upload_enabled ? "Liberado" : "Desligado"}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4">
                      <form action={toggleDeviceLogUpload}>
                        <input type="hidden" name="device_id" value={device.id} />
                        <input type="hidden" name="enabled" value={(!device.log_upload_enabled).toString()} />
                        <button type="submit" className="text-xs font-medium text-primary underline underline-offset-2">
                          {device.log_upload_enabled ? "Desligar" : "Liberar"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logs enviados sob demanda</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!logUploads || logUploads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>
          ) : (
            <div className="space-y-3">
              {logUploads.map((upload) => (
                <details key={upload.id} className="rounded-lg border border-border p-3">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{upload.cs_devices?.device_name ?? upload.device_id.slice(0, 8)}</span>
                    {" — "}
                    {upload.tenants?.name ?? "-"}
                    {" — "}
                    {new Date(upload.period_start).toLocaleString("pt-BR")} ate {new Date(upload.period_end).toLocaleString("pt-BR")}
                    {" — "}
                    <span className="text-muted-foreground">{upload.entry_count} linha(s)</span>
                  </summary>
                  <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                    {JSON.stringify(upload.entries, null, 2)}
                  </pre>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
                <th className="py-3 pr-4 font-medium">PDPJ</th>
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
