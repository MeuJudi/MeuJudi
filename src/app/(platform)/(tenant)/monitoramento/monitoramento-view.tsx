"use client";

import { useMemo, useState, useTransition } from "react";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  GripVertical,
  KanbanSquare,
  ListFilter,
  Megaphone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  createKanbanColumn,
  createSampleProcesses,
  deleteKanbanColumn,
  moveProcessToColumn,
  renameKanbanColumn,
  reorderKanbanColumns,
} from "./actions";
import { cn } from "@/lib/utils";

export type KanbanColumn = {
  id: string;
  name: string;
  position: number;
  color: string;
  isDefault: boolean;
};

export type MonitorProcess = {
  id: string;
  cnj: string;
  title: string;
  subtitle: string;
  tribunal: string;
  status: "ativo" | "suspenso" | "arquivado" | "concluido";
  statusLabel: string;
  kanbanColumnId: string | null;
  tags: string[];
  isFavorito: boolean;
  prazoProximaResposta: string | null;
  proximaAudiencia: string | null;
  dataUltimaMovimentacao: string | null;
  latestMovement: string | null;
  unreadMovements: number;
};

type MonitoramentoViewProps = {
  tenantId: string | null;
  kanbanColumns: KanbanColumn[];
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

function ProcessCard({ process, compact = false, dragHandle }: { process: MonitorProcess; compact?: boolean; dragHandle?: React.ReactNode }) {
  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] transition-shadow hover:shadow-md">
      <CardContent className={compact ? "p-3" : "flex flex-wrap items-center justify-between gap-4 p-4"}>
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {dragHandle}
            <p className="font-mono text-xs text-[var(--color-muted-foreground)]">{process.cnj}</p>
            {process.unreadMovements > 0 ? (
              <Badge className="border-[var(--tenant-wine)] bg-transparent text-[var(--tenant-wine)]">
                {process.unreadMovements} nova{process.unreadMovements > 1 ? "s" : ""}
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-1 font-semibold text-[var(--color-card-foreground)]">{process.title}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{process.latestMovement ?? process.subtitle}</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">
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

function SortableProcessCard({ process }: { process: MonitorProcess }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: process.id,
    data: { type: "process", columnId: process.kanbanColumnId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
    >
      <ProcessCard
        process={process}
        compact
        dragHandle={(
          <button
            type="button"
            className="cursor-grab rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)] active:cursor-grabbing"
            aria-label="Arrastar processo"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
      />
    </div>
  );
}

function SortableColumn({
  column,
  processes,
  editingColumnId,
  draftName,
  onStartEdit,
  onDraftNameChange,
  onSaveName,
  onCancelEdit,
  onDeleteColumn,
}: {
  column: KanbanColumn;
  processes: MonitorProcess[];
  editingColumnId: string | null;
  draftName: string;
  onStartEdit: (column: KanbanColumn) => void;
  onDraftNameChange: (value: string) => void;
  onSaveName: (column: KanbanColumn) => void;
  onCancelEdit: () => void;
  onDeleteColumn: (column: KanbanColumn) => void;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id, data: { type: "column" } });
  const editing = editingColumnId === column.id;

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex max-h-[680px] min-h-[460px] w-[320px] shrink-0 flex-col rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3",
        isDragging && "opacity-50",
        isOver && "ring-2 ring-primary",
      )}
    >
      <header className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface)] active:cursor-grabbing"
            aria-label="Arrastar coluna"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: column.color }} />
          {editing ? (
            <input
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              className="min-w-0 flex-1 rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none focus:ring-2 focus:ring-primary"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter") onSaveName(column);
                if (event.key === "Escape") onCancelEdit();
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => onStartEdit(column)}
              className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--tenant-surface-foreground)]"
              title="Clique para renomear"
            >
              {column.name}
            </button>
          )}
          <span className="rounded-full bg-[var(--tenant-surface)] px-2 py-0.5 font-mono text-xs text-[var(--tenant-surface-foreground)]">
            {processes.length}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <div className="flex gap-1">
              <Button type="button" size="sm" className="h-7 px-2" onClick={() => onSaveName(column)}>
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={onCancelEdit}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-muted-foreground)]">Arraste processos para esta coluna</p>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[var(--tenant-wine)]"
            onClick={() => onDeleteColumn(column)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div ref={setDropRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <SortableContext items={processes.map((process) => process.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {processes.map((process) => <SortableProcessCard key={process.id} process={process} />)}
            {processes.length === 0 ? (
              <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
                Solte processos aqui.
              </div>
            ) : null}
          </div>
        </SortableContext>
      </div>
    </section>
  );
}

function DeleteColumnDialog({
  column,
  columns,
  onCancel,
  onConfirm,
}: {
  column: KanbanColumn;
  columns: KanbanColumn[];
  onCancel: () => void;
  onConfirm: (targetColumnId: string) => void;
}) {
  const targets = columns.filter((item) => item.id !== column.id);
  const [targetColumnId, setTargetColumnId] = useState(targets[0]?.id ?? "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-lg rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-[var(--tenant-surface-foreground)] shadow-xl">
        <h2 className="font-display text-2xl font-bold">Excluir coluna</h2>
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">
          Os processos desta coluna precisam ser movidos para outra coluna antes da coluna ser ocultada.
        </p>
        <label className="mt-4 block text-sm font-medium">
          Coluna destino
          <select
            value={targetColumnId}
            onChange={(event) => setTargetColumnId(event.target.value)}
            className="mt-2 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>{target.name}</option>
            ))}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="button" disabled={!targetColumnId} onClick={() => onConfirm(targetColumnId)}>
            Mover e excluir
          </Button>
        </div>
      </div>
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
      <p className="mx-auto mt-2 max-w-lg text-sm text-[var(--color-muted-foreground)]">
        Quando processos forem cadastrados, capturados pelo CS/PJe ou vinculados pelo DataJud/Mural, eles aparecerao aqui com status, prazos e movimentacoes.
      </p>
      <form action={createSampleProcesses} className="mt-5">
        <Button type="submit">
          Criar 15 processos de exemplo
        </Button>
      </form>
    </div>
  );
}

export function MonitoramentoView({
  tenantId,
  kanbanColumns,
  processes,
  metrics,
  muralItems,
  error,
}: MonitoramentoViewProps) {
  const [view, setView] = useState<"lista" | "kanban" | "mural">("lista");
  const [query, setQuery] = useState("");
  const [localColumns, setLocalColumns] = useState(() => [...kanbanColumns].sort((a, b) => a.position - b.position));
  const [localProcesses, setLocalProcesses] = useState(processes);
  const [activeProcess, setActiveProcess] = useState<MonitorProcess | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleteColumn, setDeleteColumn] = useState<KanbanColumn | null>(null);
  const [isPending, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return localProcesses;
    return localProcesses.filter((process) =>
      [process.cnj, process.title, process.subtitle, process.tribunal, process.statusLabel, ...process.tags]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [localProcesses, query]);

  const grouped = useMemo(() => {
    return localColumns.map((column) => ({
      ...column,
      processes: filtered.filter((process) => process.kanbanColumnId === column.id),
    }));
  }, [filtered, localColumns]);

  function handleDragStart(event: DragStartEvent) {
    if (event.active.data.current?.type === "process") {
      setActiveProcess(localProcesses.find((process) => process.id === event.active.id) ?? null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveProcess(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeType = active.data.current?.type;
    const overType = over.data.current?.type;

    if (activeType === "column" && overType === "column") {
      const oldIndex = localColumns.findIndex((column) => column.id === active.id);
      const newIndex = localColumns.findIndex((column) => column.id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;
      const reordered = arrayMove(localColumns, oldIndex, newIndex).map((column, position) => ({ ...column, position }));
      setLocalColumns(reordered);
      startTransition(async () => {
        await reorderKanbanColumns(reordered.map((column) => column.id));
      });
      return;
    }

    if (activeType === "process") {
      const processId = String(active.id);
      const sourceProcess = localProcesses.find((process) => process.id === processId);
      const targetColumnId = overType === "process"
        ? String(over.data.current?.columnId)
        : String(over.id);

      if (!sourceProcess || sourceProcess.kanbanColumnId === targetColumnId || !localColumns.some((column) => column.id === targetColumnId)) return;

      setLocalProcesses((current) => current.map((process) => (
        process.id === processId ? { ...process, kanbanColumnId: targetColumnId } : process
      )));
      startTransition(async () => {
        await moveProcessToColumn(processId, targetColumnId);
      });
    }
  }

  function handleCreateColumn() {
    if (!tenantId) return;
    startTransition(async () => {
      const column = await createKanbanColumn(tenantId);
      setLocalColumns((current) => [...current, {
        id: column.id,
        name: column.name,
        position: column.position,
        color: column.color,
        isDefault: column.is_default,
      }]);
    });
  }

  function handleStartEdit(column: KanbanColumn) {
    setEditingColumnId(column.id);
    setDraftName(column.name);
  }

  function handleSaveName(column: KanbanColumn) {
    const cleanName = draftName.trim();
    if (!cleanName) return;
    setLocalColumns((current) => current.map((item) => item.id === column.id ? { ...item, name: cleanName } : item));
    setEditingColumnId(null);
    startTransition(async () => {
      await renameKanbanColumn(column.id, cleanName);
    });
  }

  function handleConfirmDelete(column: KanbanColumn, targetColumnId: string) {
    setLocalProcesses((current) => current.map((process) => (
      process.kanbanColumnId === column.id ? { ...process, kanbanColumnId: targetColumnId } : process
    )));
    setLocalColumns((current) => current.filter((item) => item.id !== column.id));
    setDeleteColumn(null);
    startTransition(async () => {
      await deleteKanbanColumn(column.id, targetColumnId);
    });
  }

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
                <p className="text-sm text-[var(--color-muted-foreground)]">{metric.label}</p>
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
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    view === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </button>
              ))}
            </div>

            <div className="flex min-w-[260px] flex-1 flex-wrap items-center justify-end gap-2">
              {view === "kanban" ? (
                <Button type="button" onClick={handleCreateColumn} disabled={!tenantId || isPending} className="h-9">
                  <Plus className="h-4 w-4" />
                  Coluna
                </Button>
              ) : null}
              <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-[var(--color-muted-foreground)] md:max-w-md">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filtrar por CNJ, parte, tribunal ou tag"
                  className="w-full bg-transparent text-[var(--tenant-surface-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
                />
              </label>
            </div>
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="overflow-x-auto pb-2">
                <SortableContext items={localColumns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-h-[500px] gap-4">
                    {grouped.map((column) => (
                      <SortableColumn
                        key={column.id}
                        column={column}
                        processes={column.processes}
                        editingColumnId={editingColumnId}
                        draftName={draftName}
                        onStartEdit={handleStartEdit}
                        onDraftNameChange={setDraftName}
                        onSaveName={handleSaveName}
                        onCancelEdit={() => setEditingColumnId(null)}
                        onDeleteColumn={setDeleteColumn}
                      />
                    ))}
                  </div>
                </SortableContext>
              </div>
              <DragOverlay>
                {activeProcess ? (
                  <div className="w-[300px] rotate-1 shadow-xl">
                    <ProcessCard process={activeProcess} compact />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          ) : null}

          {view === "mural" ? (
            <div className="space-y-3">
              {muralItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-sm text-[var(--color-muted-foreground)]">
                  Nenhuma comunicacao do Mural vinculada ao escritorio ainda.
                </div>
              ) : (
                muralItems.map((item) => (
                  <Card key={item.id} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div>
                        <p className="font-medium text-[var(--color-card-foreground)]">{item.title}</p>
                        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{item.processTitle ?? "Sem processo vinculado"}</p>
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

      {deleteColumn ? (
        <DeleteColumnDialog
          column={deleteColumn}
          columns={localColumns}
          onCancel={() => setDeleteColumn(null)}
          onConfirm={(targetColumnId) => handleConfirmDelete(deleteColumn, targetColumnId)}
        />
      ) : null}
    </div>
  );
}
