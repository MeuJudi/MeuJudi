"use client";

import { useMemo, useState } from "react";
import { Bell, CalendarDays, CheckCircle2, Clock3, FileText, KanbanSquare, ListFilter, Megaphone, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { updateProcessStatus } from "./actions";

export type MonitorProcess = {
  id: string;
  cnj: string;
  title: string;
  subtitle: string;
  tribunal: string;
  status: "ativo" | "suspenso" | "arquivado" | "concluido";
  statusLabel: string;
  tags: string[];
  isFavorito: boolean;
  prazoProximaResposta: string | null;
  proximaAudiencia: string | null;
  dataUltimaMovimentacao: string | null;
  latestMovement: string | null;
  unreadMovements: number;
};

type MonitoramentoViewProps = {
  processes: MonitorProcess[];
  metrics: {
    active: number;
    newMovements: number;
    upcomingDeadlines: number;
    muralPending: number;
  };
  muralItems: {
    id: string;
    title: string;
    tribunal: string;
    date: string;
    processTitle: string | null;
  }[];
  error?: string;
};

const columns: { status: MonitorProcess["status"]; label: string; helper: string }[] = [
  { status: "ativo", label: "Em acompanhamento", helper: "Processos ativos e monitorados" },
  { status: "suspenso", label: "Aguardando", helper: "Pausados ou aguardando fato externo" },
  { status: "arquivado", label: "Arquivados", helper: "Fora do fluxo principal" },
  { status: "concluido", label: "Concluidos", helper: "Encerrados ou finalizados" },
];

const statusClass: Record<MonitorProcess["status"], string> = {
  ativo: "bg-[color-mix(in_srgb,var(--tenant-brass)_15%,transparent)] text-[#8c6425]",
  suspenso: "bg-muted text-muted-foreground",
  arquivado: "bg-[color-mix(in_srgb,var(--tenant-sidebar)_8%,transparent)] text-[var(--color-card-foreground)]",
  concluido: "bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]",
};

function shortDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function ProcessCard({ process, compact = false }: { process: MonitorProcess; compact?: boolean }) {
  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] transition-shadow hover:shadow-md">
      <CardContent className={compact ? "p-3" : "flex flex-wrap items-center justify-between gap-4 p-4"}>
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs text-muted-foreground">{process.cnj}</p>
            {process.unreadMovements > 0 ? (
              <Badge className="border-[var(--tenant-wine)] bg-transparent text-[var(--tenant-wine)]">
                {process.unreadMovements} nova{process.unreadMovements > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-1 font-semibold text-[var(--color-card-foreground)]">{process.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{process.latestMovement ?? process.subtitle}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              Prazo: {shortDate(process.prazoProximaResposta)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3 w-3" />
              Audiencia: {shortDate(process.proximaAudiencia)}
            </span>
          </div>
        </div>
        <div className={compact ? "mt-3 flex flex-wrap gap-2" : "flex flex-wrap items-center gap-2"}>
          <Badge variant="outline">{process.tribunal}</Badge>
          <Badge className={statusClass[process.status]}>{process.statusLabel}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function MonitoramentoView({ processes, metrics, muralItems, error }: MonitoramentoViewProps) {
  const [view, setView] = useState<"lista" | "kanban" | "mural">("lista");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return processes;
    return processes.filter((process) =>
      [process.cnj, process.title, process.subtitle, process.tribunal, process.statusLabel, ...process.tags]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [processes, query]);

  const grouped = useMemo(() => {
    return columns.map((column) => ({
      ...column,
      processes: filtered.filter((process) => process.status === column.status),
    }));
  }, [filtered]);

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">
            Monitoramento de processos
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">
            Atualizacoes dos tribunais, movimentacoes novas, prazos e comunicacoes publicas vinculadas ao escritorio.
          </p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">
          {metrics.active} processos ativos
        </Badge>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-4">
        {[
          { label: "Processos ativos", value: metrics.active, icon: FileText },
          { label: "Movimentacoes novas", value: metrics.newMovements, icon: Bell },
          { label: "Prazos proximos", value: metrics.upcomingDeadlines, icon: CalendarDays },
          { label: "Mural pendente", value: metrics.muralPending, icon: Megaphone },
        ].map((metric) => (
          <Card key={metric.label} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-3xl font-semibold">{metric.value}</p>
              </div>
              <metric.icon className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-1">
              {[
                ["lista", ListFilter, "Lista"],
                ["kanban", KanbanSquare, "Kanban"],
                ["mural", Megaphone, "Mural"],
              ].map(([value, Icon, label]) => (
                <button
                  key={value as string}
                  type="button"
                  onClick={() => setView(value as "lista" | "kanban" | "mural")}
                  className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    view === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </button>
              ))}
            </div>

            <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-muted-foreground md:max-w-md">
              <Search className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filtrar por CNJ, parte, tribunal ou tag"
                className="w-full bg-transparent text-[var(--tenant-surface-foreground)] outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          {view === "lista" ? (
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <EmptyState />
              ) : (
                filtered.map((process) => <ProcessCard key={process.id} process={process} />)
              )}
            </div>
          ) : null}

          {view === "kanban" ? (
            <div className="grid gap-4 xl:grid-cols-4">
              {grouped.map((column) => (
                <div key={column.status} className="min-h-[360px] rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                  <div className="mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.label}</h2>
                      <span className="rounded-full bg-[var(--tenant-surface)] px-2 py-0.5 font-mono text-xs text-[var(--tenant-surface-foreground)]">{column.processes.length}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{column.helper}</p>
                  </div>
                  <div className="space-y-3">
                    {column.processes.map((process) => (
                      <div key={process.id} className="space-y-2">
                        <ProcessCard process={process} compact />
                        <form action={updateProcessStatus} className="flex flex-wrap gap-1">
                          <input type="hidden" name="id" value={process.id} />
                          {columns
                            .filter((target) => target.status !== process.status)
                            .map((target) => (
                              <Button key={target.status} name="status" value={target.status} type="submit" size="sm" variant="outline" className="h-7 px-2 text-[11px]">
                                {target.label}
                              </Button>
                            ))}
                        </form>
                      </div>
                    ))}
                    {column.processes.length === 0 ? (
                      <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-center text-xs text-muted-foreground">
                        Nenhum processo aqui.
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {view === "mural" ? (
            <div className="space-y-3">
              {muralItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-sm text-muted-foreground">
                  Nenhuma comunicacao do Mural vinculada ao escritorio ainda.
                </div>
              ) : (
                muralItems.map((item) => (
                  <Card key={item.id} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-[var(--color-card-foreground)]">{item.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{item.processTitle ?? "Sem processo vinculado"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{item.tribunal}</Badge>
                        <Badge className="bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[#8c6425]">
                          {shortDate(item.date)}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-8 text-center text-[var(--tenant-surface-foreground)]">
      <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
      <h2 className="mt-3 font-display text-xl font-semibold text-[var(--color-card-foreground)]">
        Nenhum processo monitorado ainda
      </h2>
      <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
        Quando processos forem cadastrados, capturados pelo CS/PJe ou vinculados pelo DataJud/Mural, eles aparecerao aqui com status, prazos e movimentacoes.
      </p>
    </div>
  );
}
