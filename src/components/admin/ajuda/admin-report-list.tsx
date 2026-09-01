"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bug, HelpCircle, Image, Lightbulb } from "lucide-react";
import type { SupportReportWithTenant } from "@/app/(super-admin)/admin/ajuda/actions";

const TYPE_CONFIG: Record<string, { icon: typeof Bug; label: string; color: string }> = {
  bug: { icon: Bug, label: "Erro", color: "text-red-400" },
  sugestao: { icon: Lightbulb, label: "Sugestao", color: "text-blue-400" },
  duvida: { icon: HelpCircle, label: "Duvida", color: "text-amber-400" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-blue-500/20 text-blue-300" },
  em_andamento: { label: "Em andamento", color: "bg-amber-500/20 text-amber-300" },
  respondido: { label: "Respondido", color: "bg-emerald-500/20 text-emerald-300" },
  arquivado: { label: "Arquivado", color: "bg-muted/20 text-muted-foreground" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function updateSearchParam(params: URLSearchParams, key: string, value: string) {
  const next = new URLSearchParams(params);
  if (value && value !== "all") next.set(key, value);
  else next.delete(key);
  next.delete("page");
  return next.toString();
}

export function AdminReportList({
  reports,
  statuses,
  tenants,
}: {
  reports: SupportReportWithTenant[];
  statuses: { novo: number; em_andamento: number; respondido: number; arquivado: number; total: number };
  tenants: { id: string; name: string }[];
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const currentStatus = searchParams.get("status") ?? "all";
  const currentType = searchParams.get("type") ?? "all";
  const currentTenant = searchParams.get("tenant") ?? "all";

  return (
    <div className="space-y-4">
      {/* Contadores */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => router.push(`${pathname}?${updateSearchParam(searchParams, "status", "all")}`)}
          className={`rounded-full px-3 py-1 text-xs font-bold transition ${
            currentStatus === "all"
              ? "bg-[var(--tenant-brass)] text-[var(--tenant-brass-foreground)]"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          Todos ({statuses.total})
        </button>
        {Object.entries(statuses).filter(([k]) => k !== "total").map(([key, count]) => {
          const cfg = STATUS_CONFIG[key];
          if (!cfg) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => router.push(`${pathname}?${updateSearchParam(searchParams, "status", key)}`)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                currentStatus === key
                  ? "bg-[var(--tenant-brass)] text-[var(--tenant-brass-foreground)]"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select
          value={currentType}
          onChange={(e) => router.push(`${pathname}?${updateSearchParam(searchParams, "type", e.target.value)}`)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="all">Todos os tipos</option>
          <option value="bug">Erros</option>
          <option value="sugestao">Sugestoes</option>
          <option value="duvida">Duvidas</option>
        </select>
        <select
          value={currentTenant}
          onChange={(e) => router.push(`${pathname}?${updateSearchParam(searchParams, "tenant", e.target.value)}`)}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs"
        >
          <option value="all">Todos os tenants</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {reports.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum report encontrado.</p>
      ) : (
        <div className="space-y-2">
          {reports.map((report) => {
            const typeConfig = TYPE_CONFIG[report.report_type] ?? TYPE_CONFIG.bug;
            const statusConfig = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.novo;
            const TypeIcon = typeConfig.icon;

            return (
              <Link
                key={report.id}
                href={`/admin/ajuda/${report.id}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-background p-4 transition hover:bg-muted/50"
              >
                <TypeIcon className={`size-4 shrink-0 ${typeConfig.color}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {report.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {report.tenants?.name ?? "Tenant"} · {report.user_name} · {formatDate(report.created_at)}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusConfig.color}`}>
                  {statusConfig.label}
                </span>
                {report.screenshot_url && (
                  <Image className="size-4 shrink-0 text-muted-foreground" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
