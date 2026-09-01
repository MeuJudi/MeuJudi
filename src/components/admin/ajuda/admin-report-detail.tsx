"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Archive, Bug, CheckCircle2, HelpCircle, Lightbulb, Loader2, RotateCcw, Send } from "lucide-react";
import Link from "next/link";
import { answerSupportReport, setSupportReportStatus } from "@/app/(super-admin)/admin/ajuda/actions";
import type { SupportReportWithTenant } from "@/app/(super-admin)/admin/ajuda/actions";

const TYPE_CONFIG: Record<string, { icon: typeof Bug; label: string; color: string; bg: string }> = {
  bug: { icon: Bug, label: "Erro", color: "text-red-400", bg: "bg-red-500/10 border-red-500/30" },
  sugestao: { icon: Lightbulb, label: "Sugestao", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30" },
  duvida: { icon: HelpCircle, label: "Duvida", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
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

export function AdminReportDetail({ report }: { report: SupportReportWithTenant }) {
  const [answer, setAnswer] = useState(report.answer ?? "");
  const [isAnswering, startAnswer] = useTransition();
  const [isStatusChanging, startStatusChange] = useTransition();
  const [saved, setSaved] = useState(false);

  const typeConfig = TYPE_CONFIG[report.report_type] ?? TYPE_CONFIG.bug;
  const statusConfig = STATUS_CONFIG[report.status] ?? STATUS_CONFIG.novo;
  const TypeIcon = typeConfig.icon;

  function handleAnswer() {
    startAnswer(async () => {
      const result = await answerSupportReport(report.id, answer);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  }

  function handleStatusChange(newStatus: string) {
    startStatusChange(async () => {
      await setSupportReportStatus(report.id, newStatus);
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/admin/ajuda"
          className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <TypeIcon className={`size-5 ${typeConfig.color}`} />
            <h1 className="text-xl font-semibold text-foreground">{report.title}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {report.tenants?.name ?? "Tenant"} · {report.user_name}
            {report.user_email && ` · ${report.user_email}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusConfig.color}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Status actions */}
      <div className="flex flex-wrap gap-2">
        {report.status !== "em_andamento" && (
          <button
            type="button"
            disabled={isStatusChanging}
            onClick={() => handleStatusChange("em_andamento")}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <Loader2 className={`size-3 ${isStatusChanging ? "animate-spin" : "hidden"}`} />
            Marcar em andamento
          </button>
        )}
        {report.status !== "novo" && (
          <button
            type="button"
            disabled={isStatusChanging}
            onClick={() => handleStatusChange("novo")}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <RotateCcw className="size-3" />
            Reabrir
          </button>
        )}
        {report.status !== "arquivado" && (
          <button
            type="button"
            disabled={isStatusChanging}
            onClick={() => handleStatusChange("arquivado")}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-muted"
          >
            <Archive className="size-3" />
            Arquivar
          </button>
        )}
      </div>

      {/* Details */}
      <div className="space-y-4 rounded-xl border border-border bg-background p-5">
        <div>
          <p className="mb-1 text-xs font-bold text-muted-foreground">Descricao</p>
          <p className="whitespace-pre-wrap text-sm text-foreground">{report.description}</p>
        </div>

        {report.page_url && (
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">Pagina</p>
            <p className="text-sm text-foreground">{report.page_url}</p>
          </div>
        )}

        {report.screenshot_url && (
          <div>
            <p className="mb-1 text-xs font-bold text-muted-foreground">Print</p>
            <a href={report.screenshot_url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={report.screenshot_url}
                alt="Print do report"
                className="max-h-80 rounded-lg border border-border object-contain"
              />
            </a>
          </div>
        )}

        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>Criado: {formatDate(report.created_at)}</span>
          {report.updated_at !== report.created_at && (
            <span>Atualizado: {formatDate(report.updated_at)}</span>
          )}
        </div>
      </div>

      {/* Answer section */}
      <div className="space-y-3 rounded-xl border border-border bg-background p-5">
        <h3 className="text-sm font-semibold text-foreground">Responder</h3>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={4}
          placeholder="Escreva a resposta para o tenant..."
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-[var(--tenant-brass)] focus:ring-1 focus:ring-[var(--tenant-brass)]/30"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isAnswering || answer.trim().length < 2}
            onClick={handleAnswer}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--tenant-brass)] px-4 py-2 text-xs font-bold text-[var(--tenant-brass-foreground)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnswering ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
            {isAnswering ? "Salvando..." : "Salvar resposta"}
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="size-3" />
              Salvo!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
