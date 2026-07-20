"use client";

import { useMemo, useState } from "react";
import { BarChart3, Bell, CalendarDays, CheckSquare, Download, FileDown, FileText, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type ReportData = {
  processes: { id: string; status: "ativo" | "suspenso" | "arquivado" | "concluido"; tribunal: string | null; prazo_proxima_resposta: string | null }[];
  clients: number;
  tasks: { id: string; priority: "alta" | "media" | "baixa"; due_date: string | null }[];
  movements: number;
};

type SectionId = "resumo" | "situacao" | "tribunais" | "tarefas" | "clientes";
type ReportLine = { section: string; indicator: string; value: string | number };
type ChartItem = { label: string; value: number };

const statusLabels = { ativo: "Em acompanhamento", suspenso: "Aguardando", arquivado: "Arquivado", concluido: "Concluído" };
const priorityLabels = { alta: "Alta", media: "Média", baixa: "Baixa" };
const sectionLabels: Record<SectionId, string> = { resumo: "Resumo geral", situacao: "Processos por situação", tribunais: "Processos por tribunal", tarefas: "Tarefas por prioridade", clientes: "Base de clientes" };
const chartColors = ["var(--tenant-brass)", "var(--tenant-moss)", "var(--tenant-wine)", "var(--tenant-sidebar)", "var(--tenant-surface-foreground)"];

function ChartLegend({ items }: { items: ChartItem[] }) {
  return <div className="grid gap-2 sm:grid-cols-2">{items.map((item, index) => <div key={item.label} className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="truncate text-[var(--tenant-surface-foreground)]">{item.label}</span></span><span className="font-mono text-xs font-semibold text-[var(--tenant-surface-foreground)]">{item.value}</span></div>)}</div>;
}

function DonutChart({ items }: { items: ChartItem[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return <div className="grid items-center gap-5 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 sm:grid-cols-[150px_1fr]"><div className="relative mx-auto h-36 w-36"><svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" role="img" aria-label={`Distribuição de ${total} processos`}><circle cx="60" cy="60" r={radius} fill="none" stroke="var(--tenant-surface)" strokeWidth="14" />{total > 0 ? items.map((item, index) => { const length = (item.value / total) * circumference; const segment = <circle key={item.label} cx="60" cy="60" r={radius} fill="none" stroke={chartColors[index % chartColors.length]} strokeWidth="14" strokeLinecap="round" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} />; offset += length; return segment; }) : null}</svg><div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-2xl font-semibold text-[var(--tenant-surface-foreground)]">{total}</span><span className="text-xs text-[var(--color-muted-foreground)]">processos</span></div></div><ChartLegend items={items} /></div>;
}

function TribunalBarChart({ items, total }: { items: ChartItem[]; total: number }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-4 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4"><div className="grid grid-cols-[minmax(90px,0.9fr)_minmax(110px,1.6fr)_32px] items-center gap-3 text-[11px] font-medium text-[var(--color-muted-foreground)]"><span>Tribunal</span><span className="text-center">Volume de processos</span><span className="text-right">%</span></div><div className="space-y-3">{items.map((item, index) => { const share = total ? Math.round((item.value / total) * 100) : 0; const width = item.value ? Math.max(8, (item.value / max) * 100) : 0; return <div key={item.label} className="grid grid-cols-[minmax(90px,0.9fr)_minmax(110px,1.6fr)_32px] items-center gap-3"><div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="truncate text-xs font-medium text-[var(--tenant-surface-foreground)]" title={item.label}>{item.label}</span></div><div className="relative h-8 overflow-hidden rounded-md bg-[var(--tenant-surface)]"><div className="h-full rounded-md transition-[width] duration-200" style={{ width: `${width}%`, backgroundColor: chartColors[index % chartColors.length] }} /><span className="absolute inset-y-0 left-3 flex items-center font-mono text-xs font-semibold text-[var(--tenant-surface-foreground)]">{item.value}</span></div><span className="text-right font-mono text-xs text-[var(--color-muted-foreground)]">{share}%</span></div>; })}</div><div className="grid grid-cols-[minmax(90px,0.9fr)_minmax(110px,1.6fr)_32px] gap-3 border-t border-[var(--tenant-line)] pt-2 font-mono text-[10px] text-[var(--color-muted-foreground)]"><span /><div className="flex justify-between"><span>0</span><span>{Math.ceil(max / 2)}</span><span>{max}</span></div><span /></div><p className="text-xs text-[var(--color-muted-foreground)]">Comparação entre os cinco tribunais com maior volume.</p></div>;
}

function HorizontalBars({ items }: { items: ChartItem[] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-3 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4">{items.map((item, index) => <div key={item.label} className="rounded-md bg-[var(--tenant-surface)] p-3"><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2 font-medium text-[var(--tenant-surface-foreground)]"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index % chartColors.length] }} />{item.label}</span><span className="font-mono text-xs font-semibold text-[var(--tenant-surface-foreground)]">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-[var(--tenant-surface-muted)]"><div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${item.value ? Math.max(6, (item.value / max) * 100) : 0}%`, backgroundColor: chartColors[index % chartColors.length] }} /></div></div>)}</div>;
}

function ComparisonChart({ items }: { items: [ChartItem, ChartItem] }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="space-y-3 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4"><div className="grid gap-3 sm:grid-cols-2">{items.map((item, index) => <div key={item.label} className="rounded-md bg-[var(--tenant-surface)] p-4"><div className="flex items-start justify-between gap-3"><div><span className="mb-2 block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: chartColors[index] }} /><p className="text-sm text-[var(--color-muted-foreground)]">{item.label}</p></div><span className="font-mono text-3xl font-semibold text-[var(--tenant-surface-foreground)]">{item.value}</span></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--tenant-surface-muted)]"><div className="h-full rounded-full transition-[width] duration-200" style={{ width: `${item.value ? Math.max(8, (item.value / max) * 100) : 0}%`, backgroundColor: chartColors[index] }} /></div></div>)}</div><div className="flex items-center justify-between gap-3 border-t border-[var(--tenant-line)] pt-3 text-xs text-[var(--color-muted-foreground)]"><span>Indicadores do escritório</span><span className="font-medium text-[var(--tenant-surface-foreground)]">Período: selecionado acima</span></div></div>;
}

function downloadFile(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
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

  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-xl border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><DialogHeader><DialogTitle>Baixar relatório</DialogTitle><DialogDescription>Escolha quais informações deseja incluir no arquivo.</DialogDescription></DialogHeader><div className="grid gap-2 sm:grid-cols-2">{(Object.keys(sectionLabels) as SectionId[]).map((section) => <label key={section} className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 text-sm"><input type="checkbox" checked={sections[section]} onChange={() => onToggle(section)} className="h-4 w-4 accent-[var(--tenant-brass)]" />{sectionLabels[section]}</label>)}</div><p className="text-xs text-[var(--color-muted-foreground)]">{exportedLines.length} linha{exportedLines.length === 1 ? "" : "s"} serão incluídas.</p><DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant="outline" onClick={exportCsv} disabled={!exportedLines.length}><FileDown className="h-4 w-4" />Baixar CSV</Button><Button onClick={exportPdf} disabled={!exportedLines.length}><Download className="h-4 w-4" />Baixar PDF</Button></DialogFooter></DialogContent></Dialog>;
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
    { section: sectionLabels.resumo, indicator: "Processos em acompanhamento", value: active },
    { section: sectionLabels.resumo, indicator: `Prazos nos próximos ${period} dias`, value: deadlines },
    { section: sectionLabels.resumo, indicator: "Tarefas abertas", value: data.tasks.length },
    { section: sectionLabels.resumo, indicator: "Movimentações novas", value: data.movements },
    ...statusItems.map((item) => ({ section: sectionLabels.situacao, indicator: item.label, value: item.value })),
    ...tribunalItems.map((item) => ({ section: sectionLabels.tribunais, indicator: item.label, value: item.value })),
    ...priorityItems.map((item) => ({ section: sectionLabels.tarefas, indicator: item.label, value: item.value })),
    { section: sectionLabels.clientes, indicator: "Clientes cadastrados", value: data.clients },
    { section: sectionLabels.clientes, indicator: `Prazos nos próximos ${period} dias`, value: deadlines },
  ];

  return <div className="w-full space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Relatórios</h1><p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">Uma visão simples do que está em andamento no escritório e do que precisa de atenção.</p></div><div className="flex items-center gap-2"><Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">Dados atualizados do escritório</Badge><Button variant="outline" onClick={() => setExportOpen(true)}><Download className="h-4 w-4" />Baixar relatório</Button></div></header>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[{ label: "Processos em acompanhamento", value: active, icon: FileText }, { label: "Prazos no período", value: deadlines, icon: CalendarDays }, { label: "Tarefas abertas", value: data.tasks.length, icon: CheckSquare }, { label: "Movimentações novas", value: data.movements, icon: Bell }].map((metric) => <Card key={metric.label} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm text-[var(--color-muted-foreground)]">{metric.label}</p><p className="mt-1 text-3xl font-semibold">{metric.value}</p></div><metric.icon className="h-6 w-6 text-primary" /></CardContent></Card>)}</section>
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-4"><div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-display text-xl font-semibold">Visão do período</h2><p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Escolha até quando deseja acompanhar os próximos prazos.</p></div><div className="inline-flex rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-1">{(["7", "30", "90"] as const).map((value) => <button key={value} type="button" onClick={() => setPeriod(value)} className={cn("rounded-md px-3 py-2 text-sm font-medium", period === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm" : "text-[var(--color-muted-foreground)]")}>Próximos {value} dias</button>)}</div></div></CardContent></Card>
    <section className="grid gap-4 xl:grid-cols-2">
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Processos por situação</h2><p className="text-sm text-[var(--color-muted-foreground)]">Distribuição atual da carteira do escritório.</p></div></div><DonutChart items={statusItems} /></CardContent></Card>
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Processos por tribunal</h2><p className="text-sm text-[var(--color-muted-foreground)]">Concentração dos acompanhamentos.</p></div></div>{tribunalItems.length ? <TribunalBarChart items={tribunalItems} total={data.processes.length} /> : <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 text-sm text-[var(--color-muted-foreground)]">Cadastre processos para visualizar esta distribuição.</p>}</CardContent></Card>
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><CheckSquare className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Tarefas por prioridade</h2><p className="text-sm text-[var(--color-muted-foreground)]">O que merece atenção primeiro.</p></div></div>{data.tasks.length ? <HorizontalBars items={priorityItems} /> : <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 text-sm text-[var(--color-muted-foreground)]">Ainda não há tarefas cadastradas.</p>}</CardContent></Card>
      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]"><CardContent className="p-5"><div className="mb-5 flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" /><div><h2 className="font-display text-xl font-semibold">Base de clientes</h2><p className="text-sm text-[var(--color-muted-foreground)]">Clientes cadastrados em comparação com os prazos.</p></div></div><ComparisonChart items={[{ label: "Clientes", value: data.clients }, { label: "Prazos no período", value: deadlines }]} /></CardContent></Card>
    </section>
    {exportOpen ? <ExportDialog lines={lines} sections={sections} onToggle={(section) => setSections((current) => ({ ...current, [section]: !current[section] }))} onClose={() => setExportOpen(false)} /> : null}
  </div>;
}
