"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, Clock3, Copy, FileText, Info, LockKeyhole, Scale, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProcessDetails, type ProcessDetails } from "@/lib/process-details/actions";
import { formatMuralText } from "@/lib/mural/format-text";

type ProcessDetailsModalProps = { processId: string | null; onClose: () => void };
type ProcessTab = "resumo" | "movimentacoes" | "agenda" | "mural" | "documentos";

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatCurrency(value: number | null) {
  if (value === null || Number.isNaN(value)) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function arrayFromJson(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function initials(value: string) {
  return value.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "-";
}

function attorneyName(value: unknown) {
  if (typeof value === "object" && value && "nome" in value) return String(value.nome);
  if (typeof value === "object" && value && "name" in value) return String(value.name);
  return String(value ?? "");
}

function isPrincipalAttorney(value: unknown) {
  if (typeof value !== "object" || !value) return false;
  const record = value as Record<string, unknown>;
  return record.principal === true
    || record.is_principal === true
    || record.representante_principal === true
    || (typeof record.tipo === "string" && record.tipo.toLowerCase().includes("principal"));
}

function attorneyDetails(value: unknown) {
  if (typeof value !== "object" || !value) return { name: attorneyName(value), oab: "", uf: "", principal: false };
  const record = value as Record<string, unknown>;
  return {
    name: attorneyName(value),
    oab: String(record.oab ?? record.numero_oab ?? ""),
    uf: String(record.uf ?? record.uf_oab ?? ""),
    principal: isPrincipalAttorney(value),
  };
}

function sourceLabel(value: string) {
  const labels: Record<string, string> = { datajud: "DataJud", mural: "Mural", pje: "PJe/CS", manual: "Manual", tenant: "Escritório", public: "Público" };
  return labels[value.toLowerCase()] ?? value;
}

function statusLabel(value: string) {
  const labels: Record<string, string> = { ativo: "Ativo", suspenso: "Suspenso", arquivado: "Arquivado", concluido: "Concluído" };
  return labels[value] ?? value;
}

function Panel({ title, icon, children, className = "" }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 ${className}`}>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-[var(--tenant-surface-foreground)]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--color-muted-foreground)]">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-[var(--tenant-surface-foreground)]">{value || "-"}</dd>
    </div>
  );
}

function TimelineList({ title, icon, empty, items }: { title: string; icon: React.ReactNode; empty: string; items: { id: string; title: string; subtitle: string | null; meta: string; source?: string; warning?: boolean; longText?: boolean }[] }) {
  return (
    <Panel title={title} icon={icon}>
      {items.length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">{empty}</p> : (
        <div className="relative space-y-3 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-px before:bg-[var(--tenant-line)]">
          {items.map((item) => (
            <article key={item.id} className={`relative pl-7 ${item.warning ? "rounded-md bg-[color-mix(in_srgb,var(--tenant-brass)_12%,var(--tenant-surface))] py-3 pr-3" : ""}`}>
              <span className={`absolute left-0 top-1.5 grid h-5 w-5 place-items-center rounded-full border-2 border-[var(--tenant-surface)] ${item.warning ? "bg-[var(--tenant-brass)]" : "bg-[var(--tenant-surface-muted)]"}`}>
                {item.warning ? <AlertTriangle className="h-3 w-3 text-[var(--tenant-surface)]" /> : <span className="h-2 w-2 rounded-full bg-[var(--tenant-brass)]" />}
              </span>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--tenant-surface-foreground)]">{item.title}</p>
                <span className="font-mono text-[11px] text-[var(--color-muted-foreground)]">{item.meta}</span>
              </div>
              <p className={"mt-1 text-xs leading-5 text-[var(--color-muted-foreground)] " + (item.longText || item.source === "mural" ? "max-h-56 overflow-y-auto whitespace-pre-line" : "line-clamp-3")}>{item.source === "mural" ? formatMuralText(item.subtitle) : item.subtitle || "Sem descrição adicional."}</p>
              {item.source ? <span className="mt-2 inline-flex rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--tenant-surface-foreground)]">{sourceLabel(item.source)}</span> : null}
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function ProcessDetailsModal({ processId, onClose }: ProcessDetailsModalProps) {
  const [activeTab, setActiveTab] = useState<ProcessTab>("resumo");
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<{ processId: string | null; details: ProcessDetails | null; error: string | null }>({ processId: null, details: null, error: null });

  useEffect(() => {
    let active = true;
    setActiveTab("resumo");
    setCopied(false);
    if (!processId) return;
    getProcessDetails(processId)
      .then((result) => { if (active) setState({ processId, details: result, error: null }); })
      .catch((err: unknown) => { if (active) setState({ processId, details: null, error: err instanceof Error ? err.message : "Nao foi possivel carregar o processo." }); });
    return () => { active = false; };
  }, [processId]);

  const details = state.processId === processId ? state.details : null;
  const error = state.processId === processId ? state.error : null;
  const loading = state.processId !== processId;
  const process = details?.process;
  const attorneys = arrayFromJson(process?.advogados).map(attorneyDetails);
  const orderedAttorneys = [...attorneys].sort((a, b) => Number(b.principal) - Number(a.principal));
  const recentItems = useMemo(() => {
    if (!details) return [];
    const movements = details.movements.map((item) => ({ id: `movement-${item.id}`, title: item.nome, subtitle: item.texto_completo, meta: formatDateTime(item.data_movimento), source: item.fonte, warning: Boolean(item.prazo_fatal) }));
    const events = details.agenda.map((item) => ({ id: `agenda-${item.id}`, title: item.titulo, subtitle: item.descricao, meta: formatDateTime(item.data_inicio), source: item.fonte, warning: item.tipo === "prazo" }));
    return [...movements, ...events].slice(0, 5);
  }, [details]);

  const tabs: { id: ProcessTab; label: string }[] = [
    { id: "resumo", label: "Resumo" },
    { id: "movimentacoes", label: "Movimentações" },
    { id: "agenda", label: "Agenda" },
    { id: "mural", label: "Mural" },
    { id: "documentos", label: "Documentos" },
  ];

  async function copyCnj() {
    if (!process?.cnj) return;
    await navigator.clipboard?.writeText(process.cnj);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Dialog open={!!processId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-[min(1100px,calc(100vw-24px))] gap-0 overflow-hidden border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-0 text-[var(--tenant-surface-foreground)] shadow-2xl">
        <DialogHeader className="border-b border-[var(--tenant-line)] px-5 py-5 pr-14 sm:px-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded border border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_12%,var(--tenant-surface))] px-2 py-1 text-xs font-semibold text-[var(--tenant-brass)]">{process ? statusLabel(process.status) : "Carregando"}</span>
            <DialogTitle className="font-mono text-base font-semibold tracking-normal text-[var(--tenant-surface-foreground)] sm:text-lg">{process?.cnj ?? "Detalhes do processo"}</DialogTitle>
            {process?.nivel_sigilo ? <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]"><LockKeyhole className="h-3.5 w-3.5" /> Sigilo nível {process.nivel_sigilo}</span> : null}
          </div>
          <p className="mt-2 text-xl font-semibold text-[var(--tenant-surface-foreground)] sm:text-2xl">{process?.classe_nome ?? "Informações do processo"}</p>
          <DialogDescription className="mt-1 text-sm text-[var(--color-muted-foreground)]">{[process?.tribunal, process?.grau, process?.sistema].filter(Boolean).join(" · ") || "Processo do escritório"}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto">
          {loading ? <div className="m-5 rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-10 text-center text-sm text-[var(--color-muted-foreground)]">Carregando informações do processo...</div> : null}
          {error ? <div className="m-5 rounded-md border border-[color-mix(in_srgb,var(--color-destructive)_30%,var(--tenant-line))] bg-[color-mix(in_srgb,var(--color-destructive)_10%,var(--tenant-surface))] p-4 text-sm text-[var(--color-destructive)]">{error}</div> : null}

          {details && process ? <>
            <section className="grid divide-y divide-[var(--tenant-line)] border-b border-[var(--tenant-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Signal icon={<AlertTriangle className="h-5 w-5" />} label="Próximo prazo" value={formatDate(process.prazo_proxima_resposta)} detail={process.prazo_proxima_resposta ? "Acompanhar resposta" : "Nenhum prazo informado"} warning={Boolean(process.prazo_proxima_resposta)} />
              <Signal icon={<CalendarDays className="h-5 w-5" />} label="Próxima audiência" value={formatDateTime(process.proxima_audiencia)} detail={process.proxima_audiencia ? "Ver compromisso na agenda" : "Nenhuma audiência informada"} />
              <Signal icon={<Clock3 className="h-5 w-5" />} label="Última movimentação" value={formatDateTime(process.data_ultima_movimentacao)} detail="Atualização mais recente" />
            </section>

            <nav aria-label="Seções do processo" className="flex gap-1 overflow-x-auto border-b border-[var(--tenant-line)] px-5 sm:px-7">
              {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-selected={activeTab === tab.id} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${activeTab === tab.id ? "border-[var(--tenant-brass)] text-[var(--tenant-brass)]" : "border-transparent text-[var(--color-muted-foreground)] hover:text-[var(--tenant-surface-foreground)]"}`}>{tab.label}</button>)}
            </nav>

            <div className="space-y-4 p-5 sm:p-7">
              {activeTab === "resumo" ? <>
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]">
                  <Panel title="Partes e processo" icon={<Scale className="h-4 w-4 text-[var(--tenant-brass)]" />}>
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                      <Field label="Autor" value={process.autor} /><Field label="Réu" value={process.reu} /><Field label="Órgão julgador" value={process.orgao_julgador} /><Field label="Classe processual" value={process.classe_nome} /><Field label="Formato" value={process.formato_nome} /><Field label="Data de ajuizamento" value={formatDate(process.data_ajuizamento)} /><Field label="Valor da causa" value={formatCurrency(process.valor_causa)} /><Field label="Origem" value={sourceLabel(process.source_context)} />
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--tenant-line)] pt-4">
                      {(process.tags ?? []).map((tag) => <span key={tag} className="rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-2 py-1 text-xs text-[var(--tenant-surface-foreground)]">{tag}</span>)}
                      {(process.tags ?? []).length === 0 ? <span className="text-xs text-[var(--color-muted-foreground)]">Sem tags cadastradas.</span> : null}
                    </div>
                  </Panel>
                  <Panel title="Advogados identificados" icon={<UserRound className="h-4 w-4 text-[var(--tenant-brass)]" />}>
                    {orderedAttorneys.length > 0 ? <div className="space-y-3">
                      {orderedAttorneys.map((attorney, index) => (
                        <div key={attorney.name + "-" + attorney.oab + "-" + index} className={"flex items-center gap-3 " + (index > 0 ? "border-t border-[var(--tenant-line)] pt-3" : "")}>
                          <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-full font-semibold " + (attorney.principal ? "bg-[var(--tenant-brass)] text-[var(--tenant-surface)]" : "bg-[var(--tenant-surface-muted)] text-[var(--tenant-brass)]")}>{initials(attorney.name)}</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-semibold">{attorney.name || "Nome não informado"}</p>
                              {attorney.principal ? <span className="rounded-full bg-[color-mix(in_srgb,var(--tenant-brass)_15%,transparent)] px-2 py-0.5 text-[10px] font-semibold text-[var(--tenant-brass)]">Principal informado pela fonte</span> : null}
                            </div>
                            <p className="text-xs text-[var(--color-muted-foreground)]">{[attorney.oab && "OAB " + attorney.oab, attorney.uf].filter(Boolean).join(" / ") || "OAB não informada"}</p>
                          </div>
                        </div>
                      ))}
                    </div> : <p className="text-sm text-[var(--color-muted-foreground)]">Nenhum advogado informado pela fonte.</p>}
                    <div className="mt-4 border-t border-[var(--tenant-line)] pt-4"><p className="text-xs font-semibold">Fontes de dados</p><div className="mt-2 flex flex-wrap gap-2">{["Mural", "DataJud", "PJe/CS"].map((source) => <span key={source} className="rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-2 py-1 text-xs">{source}</span>)}</div></div>
                    <div className="mt-4 flex items-start gap-2 text-xs text-[var(--color-muted-foreground)]"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Últimas sincronizações: Mural {formatDateTime(process.ultima_sync_mural)}.</div>
                  </Panel>
                </div>
                <TimelineList title="Atividade recente" icon={<FileText className="h-4 w-4 text-[var(--tenant-brass)]" />} empty="Nenhuma atividade vinculada." items={recentItems} />
              </> : null}
              {activeTab === "movimentacoes" ? <TimelineList title="Movimentações do processo" icon={<FileText className="h-4 w-4 text-[var(--tenant-brass)]" />} empty="Nenhuma movimentação vinculada." items={details.movements.map((item) => ({ id: item.id, title: item.nome, subtitle: item.texto_completo, meta: formatDateTime(item.data_movimento), source: item.fonte, warning: Boolean(item.prazo_fatal) }))} /> : null}
              {activeTab === "agenda" ? <TimelineList title="Agenda vinculada" icon={<CalendarDays className="h-4 w-4 text-[var(--tenant-brass)]" />} empty="Nenhum evento vinculado." items={details.agenda.map((item) => ({ id: item.id, title: item.titulo, subtitle: item.descricao, meta: formatDateTime(item.data_inicio), source: item.fonte, warning: item.tipo === "prazo" }))} /> : null}
              {activeTab === "mural" ? <TimelineList title="Comunicações do Mural" icon={<FileText className="h-4 w-4 text-[var(--tenant-brass)]" />} empty="Nenhuma comunicação vinculada." items={details.mural.map((item) => ({ id: item.id, title: item.tipo_comunicacao, subtitle: item.texto, meta: `${formatDate(item.data_disponibilizacao)} · ${item.sigla_tribunal}`, source: "mural" }))} /> : null}
              {activeTab === "documentos" ? <Panel title="Documentos" icon={<FileText className="h-4 w-4 text-[var(--tenant-brass)]" />}><div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-8 text-center"><FileText className="mx-auto h-7 w-7 text-[var(--color-muted-foreground)]" /><p className="mt-2 text-sm font-medium">Nenhum documento vinculado</p><p className="mt-1 text-xs text-[var(--color-muted-foreground)]">O espaço para documentos será conectado ao processo nesta etapa.</p></div></Panel> : null}
            </div>
          </> : null}
        </div>

        <DialogFooter className="border-t border-[var(--tenant-line)] px-5 py-4 sm:px-7">
          <Button type="button" variant="outline" onClick={copyCnj} disabled={!process}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar CNJ"}</Button>
          <Button type="button" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Signal({ icon, label, value, detail, warning = false }: { icon: React.ReactNode; label: string; value: string; detail: string; warning?: boolean }) {
  return <div className="flex items-start gap-3 p-4 sm:p-5"><span className={warning ? "text-[var(--tenant-brass)]" : "text-[var(--tenant-brass)]"}>{icon}</span><div className="min-w-0"><p className="text-xs text-[var(--color-muted-foreground)]">{label}</p><p className={`mt-1 truncate text-sm font-semibold ${warning ? "text-[var(--tenant-brass)]" : "text-[var(--tenant-surface-foreground)]"}`}>{value}</p><p className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">{detail}</p></div></div>;
}
