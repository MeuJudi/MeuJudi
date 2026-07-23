import { unstable_noStore as noStore } from "next/cache";
import { Activity, CheckCircle2, ShieldAlert, Timer, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

// S6 — auditoria: métricas de validação de OAB no painel super-admin.
// Mostra quantos tenants estão em cada estado, quantas validações
// foram concluídas na última semana, taxa de sucesso vs rejeição e
// tempo médio. Útil para monitorar a saúde do sistema.

type TenantAccess = "preparacao" | "aguardando_validacao" | "liberado" | "suspenso";

type Counts = {
  tenantsByAccess: Record<TenantAccess, number>;
  usersValidated: number;
  usersTotal: number;
  validationsLast7d: number;
  validationsByStatus: Record<string, number>;
  rejectionRate: number;
  successRate: number;
  avgValidationMinutes: number | null;
};

function formatPercent(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(0)}%`;
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  if (minutes < 1) return `${(minutes * 60).toFixed(0)}s`;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
}

export default async function AdminOabStatsPage() {
  noStore();
  const { supabase } = await requireSuperAdmin();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Executa as queries em paralelo. Cada uma é best-effort: se uma
  // falhar (RLS, etc.), devolvemos contagem 0 e seguimos.
  const [
    { data: tenantsAll },
    { data: usersValidated },
    { count: usersTotal },
    { data: validationsLast7d },
    { data: validationsAll },
  ] = await Promise.all([
    supabase.from("tenants").select("access_status"),
    supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .not("oab_validated_at", "is", null),
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase
      .from("oab_validations")
      .select("status, verified_at, created_at, updated_at")
      .gte("created_at", sevenDaysAgo),
    supabase.from("oab_validations").select("status, verified_at, created_at, updated_at"),
  ]);

  const counts: Counts = {
    tenantsByAccess: {
      preparacao: 0,
      aguardando_validacao: 0,
      liberado: 0,
      suspenso: 0,
    },
    usersValidated: usersValidated?.length ?? 0,
    usersTotal: usersTotal ?? 0,
    validationsLast7d: validationsLast7d?.length ?? 0,
    validationsByStatus: {},
    rejectionRate: 0,
    successRate: 0,
    avgValidationMinutes: null,
  };

  for (const tenant of tenantsAll ?? []) {
    const status = (tenant.access_status as TenantAccess) ?? "preparacao";
    counts.tenantsByAccess[status] = (counts.tenantsByAccess[status] ?? 0) + 1;
  }

  let totalTerminal = 0;
  let totalSuccess = 0;
  let totalRejection = 0;
  const durations: number[] = [];
  for (const v of validationsAll ?? []) {
    counts.validationsByStatus[v.status as string] =
      (counts.validationsByStatus[v.status as string] ?? 0) + 1;
    if (v.status === "validada") {
      totalSuccess += 1;
      totalTerminal += 1;
      if (v.verified_at) {
        const durationMs = new Date(v.verified_at).getTime() - new Date(v.created_at).getTime();
        if (durationMs > 0) durations.push(durationMs / 60_000);
      }
    } else if (v.status === "recusada") {
      totalRejection += 1;
      totalTerminal += 1;
    }
  }
  counts.successRate = totalTerminal > 0 ? totalSuccess / totalTerminal : 0;
  counts.rejectionRate = totalTerminal > 0 ? totalRejection / totalTerminal : 0;
  counts.avgValidationMinutes =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : null;

  const totalTenants = Object.values(counts.tenantsByAccess).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Validação de OAB</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Métricas de saúde do fluxo de validação de OAB via ConfirmADV.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={<Users className="h-4 w-4" />}
          label="Tenants liberados"
          value={String(counts.tenantsByAccess.liberado)}
          sub={`de ${totalTenants} totais`}
        />
        <MetricCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Aguardando validação"
          value={String(counts.tenantsByAccess.aguardando_validacao)}
          sub={`+ ${counts.tenantsByAccess.preparacao} em preparação`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Usuários com OAB validada"
          value={String(counts.usersValidated)}
          sub={`de ${counts.usersTotal} totais`}
        />
        <MetricCard
          icon={<Activity className="h-4 w-4" />}
          label="Validações (7 dias)"
          value={String(counts.validationsLast7d)}
          sub="inclui pendentes"
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxa de sucesso</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight text-green-700">
              {formatPercent(counts.successRate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalSuccess} validações concluídas com sucesso de {totalTerminal} terminais
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Taxa de rejeição</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={cn("text-3xl font-semibold tracking-tight", counts.rejectionRate > 0.3 ? "text-destructive" : "text-amber-700")}>
              {formatPercent(counts.rejectionRate)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totalRejection} rejeições de {totalTerminal} terminais
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-4 w-4" />
              Tempo médio de validação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tracking-tight">{formatMinutes(counts.avgValidationMinutes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {durations.length} medições. Considera só validações concluídas.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(counts.validationsByStatus)
              .sort((a, b) => b[1] - a[1])
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <Badge variant="outline">{status}</Badge>
                  <span className="font-mono tabular-nums">{count}</span>
                </div>
              ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}
