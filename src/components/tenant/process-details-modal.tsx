"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3, FileText, Scale } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getProcessDetails, type ProcessDetails } from "@/lib/process-details/actions";

type ProcessDetailsModalProps = {
  processId: string | null;
  onClose: () => void;
};

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

export function ProcessDetailsModal({ processId, onClose }: ProcessDetailsModalProps) {
  const [state, setState] = useState<{
    processId: string | null;
    details: ProcessDetails | null;
    error: string | null;
  }>({ processId: null, details: null, error: null });

  useEffect(() => {
    let active = true;
    if (!processId) return;

    getProcessDetails(processId)
      .then((result) => {
        if (active) setState({ processId, details: result, error: null });
      })
      .catch((err: unknown) => {
        if (active) {
          setState({
            processId,
            details: null,
            error: err instanceof Error ? err.message : "Nao foi possivel carregar o processo.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [processId]);

  const details = state.processId === processId ? state.details : null;
  const error = state.processId === processId ? state.error : null;
  const loading = state.processId !== processId;

  return (
    <Dialog open={!!processId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <DialogHeader>
          <DialogTitle>
            <p className="font-mono text-xs text-[var(--color-muted-foreground)]">
              {details?.process.cnj ?? "Carregando processo"}
            </p>
            <h2 className="mt-1 font-display text-2xl font-bold">
              {details?.process.classe_nome ?? "Detalhes do processo"}
            </h2>
          </DialogTitle>
          <DialogDescription>Informações detalhadas do processo selecionado.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              Carregando informacoes do processo...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {details ? (
            <div className="space-y-5">
              <section className="grid gap-3 md:grid-cols-4">
                {[
                  ["Tribunal", details.process.tribunal ?? "-"],
                  ["Sistema", details.process.sistema ?? "-"],
                  ["Grau", details.process.grau ?? "-"],
                  ["Valor", formatCurrency(details.process.valor_causa)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                    <p className="text-xs text-[var(--color-muted-foreground)]">{label}</p>
                    <p className="mt-1 font-semibold">{value}</p>
                  </div>
                ))}
              </section>

              <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-md border border-[var(--tenant-line)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Scale className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Dados principais</h3>
                  </div>
                  <div className="grid gap-3 text-sm md:grid-cols-2">
                    <p><strong>Autor:</strong> {details.process.autor ?? "-"}</p>
                    <p><strong>Reu:</strong> {details.process.reu ?? "-"}</p>
                    <p><strong>Orgao julgador:</strong> {details.process.orgao_julgador ?? "-"}</p>
                    <p><strong>Status:</strong> {details.process.status}</p>
                    <p><strong>Sigilo:</strong> nivel {details.process.nivel_sigilo}</p>
                    <p><strong>Origem:</strong> {details.process.source_context}</p>
                    <p><strong>Proxima resposta:</strong> {formatDate(details.process.prazo_proxima_resposta)}</p>
                    <p><strong>Proxima audiencia:</strong> {formatDateTime(details.process.proxima_audiencia)}</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(details.process.tags ?? []).map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
                    {details.process.is_favorito ? <Badge>Favorito</Badge> : null}
                  </div>
                </div>

                <div className="rounded-md border border-[var(--tenant-line)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Sincronizacoes</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><strong>DataJud:</strong> {formatDateTime(details.process.ultima_sync_datajud)}</p>
                    <p><strong>Mural:</strong> {formatDateTime(details.process.ultima_sync_mural)}</p>
                    <p><strong>PJe/CS:</strong> {formatDateTime(details.process.ultima_sync_pje)}</p>
                    <p><strong>Ultima movimentacao:</strong> {formatDateTime(details.process.data_ultima_movimentacao)}</p>
                    <p><strong>Criado em:</strong> {formatDateTime(details.process.created_at)}</p>
                    <p><strong>Atualizado em:</strong> {formatDateTime(details.process.updated_at)}</p>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-md border border-[var(--tenant-line)] p-4">
                  <h3 className="mb-3 font-semibold">Assuntos</h3>
                  <div className="flex flex-wrap gap-2">
                    {arrayFromJson(details.process.assuntos).length === 0 ? (
                      <span className="text-sm text-[var(--color-muted-foreground)]">Nenhum assunto cadastrado.</span>
                    ) : arrayFromJson(details.process.assuntos).map((item, index) => (
                      <Badge key={index} variant="outline">
                        {typeof item === "object" && item && "nome" in item ? String(item.nome) : String(item)}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-[var(--tenant-line)] p-4">
                  <h3 className="mb-3 font-semibold">Advogados</h3>
                  <div className="space-y-2">
                    {arrayFromJson(details.process.advogados).length === 0 ? (
                      <span className="text-sm text-[var(--color-muted-foreground)]">Nenhum advogado cadastrado.</span>
                    ) : arrayFromJson(details.process.advogados).map((item, index) => (
                      <div key={index} className="rounded bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm">
                        {typeof item === "object" && item ? JSON.stringify(item) : String(item)}
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                <TimelineList
                  icon={<FileText className="h-4 w-4 text-primary" />}
                  title="Movimentacoes"
                  empty="Nenhuma movimentacao vinculada."
                  items={details.movements.map((movement) => ({
                    id: movement.id,
                    title: movement.nome,
                    subtitle: movement.texto_completo,
                    meta: `${formatDateTime(movement.data_movimento)} · ${movement.fonte}`,
                  }))}
                />
                <TimelineList
                  icon={<CalendarDays className="h-4 w-4 text-primary" />}
                  title="Agenda"
                  empty="Nenhum evento vinculado."
                  items={details.agenda.map((event) => ({
                    id: event.id,
                    title: event.titulo,
                    subtitle: event.descricao,
                    meta: `${formatDateTime(event.data_inicio)} · ${event.tipo} · ${event.fonte}`,
                  }))}
                />
                <TimelineList
                  icon={<FileText className="h-4 w-4 text-primary" />}
                  title="Mural"
                  empty="Nenhuma comunicacao vinculada."
                  items={details.mural.map((item) => ({
                    id: item.id,
                    title: item.tipo_comunicacao,
                    subtitle: item.texto,
                    meta: `${formatDate(item.data_disponibilizacao)} · ${item.sigla_tribunal}`,
                  }))}
                />
              </section>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimelineList({
  icon,
  title,
  empty,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  empty: string;
  items: { id: string; title: string; subtitle: string | null; meta: string }[];
}) {
  return (
    <div className="rounded-md border border-[var(--tenant-line)] p-4">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{empty}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-md bg-[var(--tenant-surface-muted)] p-3">
              <p className="text-sm font-semibold">{item.title}</p>
              <p className="mt-1 line-clamp-3 text-xs text-[var(--color-muted-foreground)]">{item.subtitle ?? "-"}</p>
              <p className="mt-2 font-mono text-[11px] text-[var(--color-muted-foreground)]">{item.meta}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
