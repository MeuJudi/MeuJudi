"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bell, CalendarDays, CheckSquare, Download, FileDown, FileText, UsersRound, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type ReportData = {
  processes: { id: string; status: "ativo" | "suspenso" | "arquivado" | "concluido"; tribunal: string | null; prazo_proxima_resposta: string | null }[];
  clients: number;
  tasks: { id: string; priority: "alta" | "media" | "baixa"; due_date: string | null }[];
  movements: number;
};

type SectionId = "resumo" | "situacao" | "tribunais" | "tarefas" | "clientes";
type ReportLine = { section: string; indicator: string; value: string | number };

const statusLabels = { ativo: "Em acompanhamento", suspenso: "Aguardando", arquivado: "Arquivado", concluido: "Concluído" };
const priorityLabels = { alta: "Alta", media: "Média", baixa: "Baixa" };
const sectionLabels: Record<SectionId, string> = { resumo: "Resumo geral", situacao: "Processos por situação", tribunais: "Processos por tribunal", tarefas: "Tarefas por prioridade", clientes: "Base de clientes" };
const barColors = ["bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-emerald-500"];

function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-4">{items.map((item, index) => <div key={item.label}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="truncate text-[var(--tenant-surface-foreground)]">{item.label}</span><span className="font-mono text-xs text-[var(--color-muted-foreground)]">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--tenant-surface-muted)]"><div className={cn("h-full rounded-full", barColors[index % barColors.length])} style={{ width: `${(item.value / max) * 100}%` }} /></div></div>)}</div>;
}

function downloadFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  URL.revokeObjectURL(url);
}

function ExportDialog({ lines, sections, onToggle, onClose }: { lines: ReportLine[]; sections: Record<SectionId, boolean>; onToggle: (section: SectionId) => void; onClose: () => void }) {
  const selected = (Object.keys(sections) as SectionId[]).filter((section) => sections[section]);
  const exportedLines = lines.filter((line) => selected.includes(line.section as SectionId));
  const date = new Date().toLocaleDateString("pt-BR");

  function exportCsv() {
    const csv = ["Seção;Indicador;Valor", ...exportedLines.map((line) => [line.section, line.indicator, line.value].map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))].join("\n");
    downloadFile(`\uFEFF${csv}`, "relatorio-meujudi.csv", "text/csv;charset=utf-8");
  }

  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    let y = 20;
    pdf.setFontSize(18); pdf.text("MeuJudi - Relatório do escritório", 15, y); y += 9;
    pdf.setFontSize(10); pdf.setTextColor(90); pdf.text(`Gerado em ${date}`, 15, y); y += 10;
    let currentSection = "";
    for (const line of exportedLines) {
      if (y > 275) { pdf.addPage(); y = 20; currentSection = ""; }
      if (line.section !== currentSection) { currentSection = line.section; pdf.setFontSize(13); pdf.setTextColor(20); pdf.text(currentSection, 15, y); y += 7; }
      pdf.setFontSize(10); pdf.setTextColor(70); pdf.text(`${line.indicator}: ${line.value}`, 18, y); y += 6;
    }
    pdf.save("relatorio-meujudi.pdf");
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"><div className="w-full max-w-xl rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-[var(--tenant-surface-foreground)] shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="font-display text-2xl font-bold">Baixar relatório</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Escolha quais informações deseja incluir no arquivo.</p></div><Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></Button></div><div className="mt-5 grid gap-2 sm:grid-cols-2">{(Object.keys(sectionLabels) as SectionId[]).map((section) => <label key={section} className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 text-sm"><input type="checkbox" checked={sections[section]} onChange={() => onToggle(section)} className="h-4 w-4 accent-[var(--tenant-brass)]" />{sectionLabels[section]}</label>)}</div><p className="mt-4 text-xs text-[var(--color-muted-foreground)]">{exportedLines.length} linha{exportedLines.length === 1 ? "" : "s"} serão incluídas.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="outline" onClick={exportCsv} disabled={!exportedLines.length}><FileDown className="h-4 w-4" />Baixar CSV</Button><Button onClick={exportPdf} disabled={!exportedLines.length}><Download className="h-4 w-4" />Baixar PDF</Button></div></div></div>;
}

export function RelatoriosView({ data }: { data: ReportData }) {
  const [period, setPeriod] = useState<"7" | "30" | "90">("30");
  const [exportOpen, setExportOpen] = useState(false);
  const [sections, setSections] = useState<Record<SectionId, boolean>>({ resumo: true, situacao: true, tribunais: true, tarefas: true, clientes: true });
  const today = new Date();
  const limit = new Date(today); limit.setDate(today.getDate() + Number(period));
  const statusItems = useMemo(() => Object.entries(statusLabels).map(([status, label]) => ({ label, value: data.processes.filter((process) => process.status === status).length })), [data.processes]);
  const tribunalItems = useMemo(() => Object.entries(data.processes.reduce<Record<string, number>>((result, process) => { const key = process.tribunal || "Sem tribunal informado"; result[key] = (result[key] ?? 0) + 1; return result; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5), [data.processes]);
  const priorityItems = useMemo(() => Object.entries(priorityLabels).map(([priority, label]) => ({ label, value: data.tasks.filter((task) => task.priority === priority).length })), [data.tasks]);
  const deadlines = data.processes.filter((process) => { if (!process.prazo_proxima_resposta) return false; const date = new Date(`${process.prazo_proxima_resposta}T12:00:00`); return date >= today && date <= limit; }).length;
  const active = data.processes.filter((process) => process.status === "ativo").length;
  const lines: ReportLine[] = [
    { section: sectionLabels.resumo, indicator: "Processos em acompanhamento", value: active }, { section: sectionLabels.resumo, indicator: `Prazos nos próximos ${period} dias`, value: deadlines }, { section: sectionLabels.resumo, indicator: "Tarefas abertas", value: data.tasks.length }, { section: sectionLabels.resumo, indicator: "Movimentações novas", value: data.movements },
    ...statusItems.map((item) => ({ section: sectionLabels.situacao, indicator: item.label, value: item.value })), ...tribunalItems.map((item) => ({ section: sectionLabels.tribunais, indicator: item.label, value: item.value })), ...priorityItems.map((item) => ({ section: sectionLabels.tarefas, indicator: item.label, value: item.value })), { section: sectionLabels.clientes, indicator: "Clientes cadastrados", value: data.clients }, { section: sectionLabels.clientes, indicator: `Prazos nos próximos ${period} dias`, value: deadlines },
  ];

  return <div className="w-full space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Relatórios</h1><p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">Uma visão simples do que está em andamento no escritório e do que precisa de atenção.</p></div><div className="flex items-center gap-2"><Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">Dados atualizados do escritório</Badge><Button variant="outline" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" />Baixar relatório</Button></div></header><section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[{ label: "Processos em acompanhamento", value: active, icon: FileText }, { label: "Prazos no período", value: deadlines, icon: CalendarDays }, { label: "Tarefas abertas", value: data.tasks.length, icon: CheckSquare }, { label: "Movimentações novas", value: data.movements, icon: Bell }].map((metric) => <Card key={metric.label} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm text-[var(--color-muted-foreground)]">{metric.label}</p><p className="mt-1 text-3xl font-semibold">{metric.value}</p></div><metric.icon className="h-6 w-6 text-primary" /></CardContent></Card>)}</section><Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-xl font-semibold">Visão do período</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Escolha até quando deseja acompanhar os próximos prazos.</p></div><div className="inline-flex rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-1">{(["7", "30", "90"] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={cn("rounded-md px-3 py-2 text-sm font-medium", period === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm" : "text-[var(--color-muted-foreground)]")}>Próximos {value} dias</button>)}</div></div></CardContent></Card><section className="grid gap-4 xl:grid-cols-2"><Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Processos por situação</h2><p className="text-sm text-[var(--color-muted-foreground)]">Como está a carteira do escritório.</p></div></div><BarList items={statusItems} /></CardContent></Card><Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Processos por tribunal</h2><p className="text-sm text-[var(--color-muted-foreground)]">Onde estão concentrados os acompanhamentos.</p></div></div>{tribunalItems.length ? <BarList items={tribunalItems} /> : <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 text-sm text-[var(--color-muted-foreground)]">Cadastre processos para visualizar esta distribuição.</p>}</CardContent></Card><Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><CheckSquare className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Tarefas por prioridade</h2><p className="text-sm text-[var(--color-muted-foreground)]">O que merece atenção primeiro.</p></div></div>{data.tasks.length ? <BarList items={priorityItems} /> : <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 text-sm text-[var(--color-muted-foreground)]">Ainda não há tarefas cadastradas.</p>}</CardContent></Card><Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Base de clientes</h2><p className="text-sm text-[var(--color-muted-foreground)]">Clientes cadastrados e prazos para acompanhar.</p></div></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4"><p className="text-sm text-[var(--color-muted-foreground)]">Clientes cadastrados</p><p className="mt-2 text-3xl font-semibold">{data.clients}</p></div><div className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4"><p className="text-sm text-[var(--color-muted-foreground)]">Prazos próximos</p><p className="mt-2 text-3xl font-semibold">{deadlines}</p></div></div></CardContent></Card></section>{exportOpen ? <ExportDialog lines={lines} sections={sections} onToggle={(section) => setSections((current) => ({ ...current, [section]: !current[section] }))} onClose={() => setExportOpen(false)} /> : null}</div>;
}
