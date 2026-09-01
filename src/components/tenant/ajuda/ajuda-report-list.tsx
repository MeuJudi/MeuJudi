"use client";

import { useState } from "react";
import { Bug, ChevronDown, ChevronUp, HelpCircle, Image, Lightbulb, MessageCircle } from "lucide-react";

type SupportReport = {
  id: string;
  report_type: string;
  title: string;
  description: string;
  screenshot_url: string | null;
  page_url: string | null;
  status: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

const TYPE_CONFIG = {
  bug: { icon: Bug, label: "Erro", color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
  sugestao: { icon: Lightbulb, label: "Sugestao", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" },
  duvida: { icon: HelpCircle, label: "Duvida", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-blue-500/20 text-blue-300" },
  em_andamento: { label: "Em andamento", color: "bg-amber-500/20 text-amber-300" },
  respondido: { label: "Respondido", color: "bg-emerald-500/20 text-emerald-300" },
  arquivado: { label: "Arquivado", color: "bg-[var(--color-muted-foreground)]/20 text-[var(--color-muted-foreground)]" },
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

export function AjudaReportList({ reports }: { reports: SupportReport[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (reports.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-8 text-center">
        <p className="text-sm text-[var(--color-muted-foreground)]">Voce ainda nao reportou nada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {reports.map((report) => {
        const typeConfig = TYPE_CONFIG[report.report_type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.bug;
        const statusConfig = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.novo;
        const TypeIcon = typeConfig.icon;
        const isExpanded = expandedId === report.id;
        const hasAnswer = Boolean(report.answer);

        return (
          <div
            key={report.id}
            className="rounded-xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setExpandedId(isExpanded ? null : report.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-[var(--tenant-surface-muted)]"
            >
              <TypeIcon className={`size-4 shrink-0 ${typeConfig.color}`} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--color-card-foreground)]">
                  {report.title}
                </p>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {formatDate(report.created_at)}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusConfig.color}`}>
                {statusConfig.label}
              </span>
              {hasAnswer && (
                <MessageCircle className="size-4 shrink-0 text-emerald-400" />
              )}
              {report.screenshot_url && (
                <Image className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
              )}
              {isExpanded ? (
                <ChevronUp className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
              ) : (
                <ChevronDown className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
              )}
            </button>

            {isExpanded && (
              <div className="border-t border-[var(--tenant-line)] px-4 py-4 space-y-4">
                <div>
                  <p className="mb-1 text-xs font-bold text-[var(--color-muted-foreground)]">Descricao</p>
                  <p className="whitespace-pre-wrap text-sm text-[var(--color-card-foreground)]">{report.description}</p>
                </div>

                {report.page_url && (
                  <div>
                    <p className="mb-1 text-xs font-bold text-[var(--color-muted-foreground)]">Pagina</p>
                    <p className="text-sm text-[var(--color-card-foreground)]">{report.page_url}</p>
                  </div>
                )}

                {report.screenshot_url && (
                  <div>
                    <p className="mb-1 text-xs font-bold text-[var(--color-muted-foreground)]">Print</p>
                    <a href={report.screenshot_url} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={report.screenshot_url}
                        alt="Print do report"
                        className="max-h-64 rounded-lg border border-[var(--tenant-line)] object-contain"
                      />
                    </a>
                  </div>
                )}

                {hasAnswer && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <p className="mb-1 text-xs font-bold text-emerald-400">Resposta</p>
                    <p className="whitespace-pre-wrap text-sm text-[var(--color-card-foreground)]">{report.answer}</p>
                    {report.answered_at && (
                      <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                        {formatDate(report.answered_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
