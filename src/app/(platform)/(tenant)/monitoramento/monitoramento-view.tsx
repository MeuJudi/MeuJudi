"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  FileText,
  GripVertical,
  KanbanSquare,
  ListFilter,
  Megaphone,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SearchInput } from "@/components/ui/search-input";
import { globalSearch } from "@/components/ui/search-actions";
import { ProcessDetailsModal } from "@/components/tenant/process-details-modal";
import {
  createKanbanColumn,
  deleteKanbanColumn,
  moveProcessToColumn,
  renameKanbanColumn,
  reorderKanbanColumns,
  syncTenantDataJudNow,
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
  responsavelId: string | null;
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
  agendaItems: {
    id: string;
    type: "audiencia" | "prazo" | "reuniao" | "outro";
    title: string;
    start: string;
    processId: string | null;
    processTitle: string | null;
    status: "pendente" | "concluido" | "cancelado";
  }[];
  error?: string;
  scope?: string;
  userId?: string;
};

const statusClass: Record<MonitorProcess["status"], string> = {
  ativo: "bg-[color-mix(in_srgb,var(--tenant-brass)_15%,transparent)] text-[var(--tenant-brass)]",
  suspenso: "bg-muted text-muted-foreground",
  arquivado: "bg-[color-mix(in_srgb,var(--tenant-sidebar)_8%,transparent)] text-[var(--color-card-foreground)]",
  concluido: "bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]",
};

function shortDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("pt-BR");
}

const agendaTypeLabels = {
  audiencia: "Audiencia",
  prazo: "Prazo",
  reuniao: "Reuniao",
  outro: "Evento",
} as const;

const MONITOR_PAGE_SIZE = 40;

const agendaTypeClasses = {
  audiencia: "bg-[var(--tenant-brass)]",
  prazo: "bg-[var(--tenant-wine)]",
  reuniao: "bg-[var(--tenant-moss)]",
  outro: "bg-[var(--tenant-brass)]",
} as const;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function TodayAgendaPanel({
  items,
  onOpenProcess,
}: {
  items: MonitoramentoViewProps["agendaItems"];
  onOpenProcess: (processId: string) => void;
}) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(dateKey(today));
  const [month, setMonth] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const selectedItems = items.filter((item) => dateKey(new Date(item.start)) === selectedDate);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(month);
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const calendarDays = Array.from({ length: leadingDays + daysInMonth }, (_, index) => {
    if (index < leadingDays) return null;
    return new Date(month.getFullYear(), month.getMonth(), index - leadingDays + 1);
  });
  const eventDays = new Set(items.map((item) => dateKey(new Date(item.start))));

  function moveMonth(amount: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + amount, 1);
    setMonth(next);
    setSelectedDate(dateKey(next));
  }

  return (
    <aside className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-[var(--tenant-surface-foreground)] shadow-sm xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-card-foreground)]">Hoje</h2>
          <p className="text-xs capitalize text-[var(--color-muted-foreground)]">
            {new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${selectedDate}T12:00:00`))}
          </p>
        </div>
        <CalendarDays className="h-5 w-5 text-[var(--tenant-brass)]" />
      </div>

      <div className="mt-5 space-y-4">
        {selectedItems.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--tenant-line)] px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
            Nenhum evento neste dia.
          </p>
        ) : (
          selectedItems.map((item) => (
            <div key={item.id} className="relative flex gap-3 pl-1">
              <div className="w-10 shrink-0 pt-0.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">{formatTime(item.start)}</div>
              <div className="relative min-w-0 flex-1 border-l border-[var(--tenant-line)] pl-4 pb-1">
                <span className={cn("absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--tenant-surface)]", agendaTypeClasses[item.type])} />
                <p className={cn("text-sm font-semibold", item.type === "prazo" ? "text-[var(--tenant-wine)]" : "text-[var(--color-card-foreground)]")}>
                  {agendaTypeLabels[item.type]}
                </p>
                {item.processId ? (
                  <button type="button" onClick={() => onOpenProcess(item.processId!)} className="mt-1 block text-left font-mono text-[11px] text-[var(--color-card-foreground)] hover:text-[var(--tenant-brass)]">
                    {item.processTitle ?? "Processo vinculado"}
                  </button>
                ) : null}
                <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{item.title}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 border-t border-[var(--tenant-line)] pt-4">
        <div className="flex items-center justify-between">
          <button type="button" onClick={() => moveMonth(-1)} className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)] hover:text-[var(--tenant-brass)]" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
          <p className="text-sm font-semibold capitalize">{monthLabel}</p>
          <button type="button" onClick={() => moveMonth(1)} className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)] hover:text-[var(--tenant-brass)]" aria-label="Proximo mes"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-y-2 text-center text-[10px] text-[var(--color-muted-foreground)]">
          {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`} className="font-semibold">{day}</span>)}
          {calendarDays.map((day, index) => {
            if (!day) return <span key={`empty-${index}`} />;
            const key = dateKey(day);
            const isSelected = key === selectedDate;
            const isToday = key === dateKey(today);
            return (
              <button key={key} type="button" onClick={() => setSelectedDate(key)} className={cn("relative mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors hover:bg-[var(--tenant-surface-muted)]", isSelected && "bg-[var(--tenant-brass)] text-white", !isSelected && isToday && "ring-1 ring-[var(--tenant-brass)] text-[var(--tenant-brass)]")}>
                {day.getDate()}
                {eventDays.has(key) && !isSelected ? <span className="absolute bottom-0 h-1 w-1 rounded-full bg-[var(--tenant-wine)]" /> : null}
              </button>
            );
          })}
        </div>
      </div>

      <a href="/agenda" className="mt-5 block text-sm font-medium text-[var(--tenant-brass)] hover:underline">Ver agenda completa</a>
    </aside>
  );
}

function ProcessCard({
  process,
  compact = false,
  dragHandle,
  onOpen,
}: {
  process: MonitorProcess;
  compact?: boolean;
  dragHandle?: React.ReactNode;
  onOpen?: (processId: string) => void;
}) {
  function handleOpen() {
    onOpen?.(process.id);
  }

  return (
    <div
      role={onOpen ? "button" : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (onOpen && (event.key === "Enter" || event.key === " ")) handleOpen();
      }}
      className={cn(onOpen && "cursor-pointer")}
    >
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
    </div>
  );
}

function SortableProcessCard({ process, onOpen }: { process: MonitorProcess; onOpen: (processId: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: process.id,
    data: { type: "process", columnId: process.kanbanColumnId },
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "opacity-40")}
      data-kanban-card
    >
      <ProcessCard
        process={process}
        compact
        dragHandle={(
          <button
            type="button"
            className="cursor-grab rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)] active:cursor-grabbing"
            aria-label="Arrastar processo"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        onOpen={onOpen}
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
  onOpenProcess,
}: {
  column: KanbanColumn;
  processes: MonitorProcess[];
  editingColumnId: string | null;
  draftName: string;
  onStartEdit: (column: KanbanColumn) => void;
  onDraftNameChange: (value: string) => void;
  onSaveName: (column: KanbanColumn) => void;
  onCancelEdit: () => void;
  onDeleteColumn: (column: KanbanColumn, processCount: number) => void;
  onOpenProcess: (processId: string) => void;
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
        "flex h-[min(68vh,720px)] min-h-[460px] w-[320px] shrink-0 flex-col rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3",
        isDragging && "opacity-50",
        isOver && "ring-2 ring-primary",
      )}
      data-kanban-column
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
            onClick={() => onDeleteColumn(column, processes.length)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      <div ref={setDropRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <SortableContext items={processes.map((process) => process.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {processes.map((process) => <SortableProcessCard key={process.id} process={process} onOpen={onOpenProcess} />)}
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
  column: KanbanColumn & { processCount: number };
  columns: KanbanColumn[];
  onCancel: () => void;
  onConfirm: (targetColumnId: string | null) => void;
}) {
  const targets = columns.filter((item) => item.id !== column.id);
  const hasCards = column.processCount > 0;
  const [targetColumnId, setTargetColumnId] = useState(targets[0]?.id ?? "");

  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[var(--tenant-wine)]" />
            Excluir coluna
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--color-muted-foreground)]">
            {hasCards
              ? "Os processos desta coluna precisam ser movidos para outra coluna antes da exclusão."
              : "Tem certeza que deseja excluir esta coluna vazia?"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasCards && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Coluna destino</label>
            <select
              value={targetColumnId}
              onChange={(event) => setTargetColumnId(event.target.value)}
              className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              {targets.map((target) => (
                <option key={target.id} value={target.id}>{target.name}</option>
              ))}
            </select>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(hasCards ? targetColumnId : null)}
            disabled={hasCards && !targetColumnId}
          >
            {hasCards ? "Mover e excluir" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
    </div>
  );
}

export function MonitoramentoView({
  tenantId,
  kanbanColumns,
  processes,
  metrics,
  muralItems,
  agendaItems,
  error,
  scope,
  userId,
}: MonitoramentoViewProps) {
  const [view, setView] = useState<"lista" | "kanban" | "mural">("lista");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [localColumns, setLocalColumns] = useState(() => [...kanbanColumns].sort((a, b) => a.position - b.position));
  const [localProcesses, setLocalProcesses] = useState(processes);
  const [activeProcess, setActiveProcess] = useState<MonitorProcess | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [deleteColumn, setDeleteColumn] = useState<(KanbanColumn & { processCount: number }) | null>(null);
  const [creatingNewColumn, setCreatingNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<{ pointerId: number; startX: number; startScrollLeft: number; active: boolean } | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let result = localProcesses;
    if (scope === "mine" && userId) {
      result = result.filter((process) => process.responsavelId === userId);
    }
    if (!term) return result;
    return result.filter((process) =>
      [process.cnj, process.title, process.subtitle, process.tribunal, process.statusLabel, ...process.tags]
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [localProcesses, query, scope, userId]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / MONITOR_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleProcesses = useMemo(
    () => filtered.slice(currentPage * MONITOR_PAGE_SIZE, (currentPage + 1) * MONITOR_PAGE_SIZE),
    [currentPage, filtered],
  );

  useEffect(() => {
    setPage(0);
  }, [query, scope]);

  const grouped = useMemo(() => {
    return localColumns.map((column) => ({
      ...column,
      processes: visibleProcesses.filter((process) => process.kanbanColumnId === column.id),
    }));
  }, [localColumns, visibleProcesses]);

  function shouldStartBoardPan(target: EventTarget | null) {
    if (!(target instanceof Element)) return false;
    return !target.closest("[data-kanban-column], [data-kanban-card], button, input, select, textarea, a");
  }

  function handleBoardPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !shouldStartBoardPan(event.target)) return;
    const board = boardScrollRef.current;
    if (!board) return;

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: board.scrollLeft,
      active: true,
};

    board.setPointerCapture(event.pointerId);
    board.dataset.panning = "true";
  }

  function handleBoardPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const panState = panStateRef.current;
    const board = boardScrollRef.current;
    if (!panState?.active || !board || panState.pointerId !== event.pointerId) return;

    event.preventDefault();
    board.scrollLeft = panState.startScrollLeft - (event.clientX - panState.startX);
  }

  function endBoardPan(event: React.PointerEvent<HTMLDivElement>) {
    const panState = panStateRef.current;
    const board = boardScrollRef.current;
    if (!panState || panState.pointerId !== event.pointerId || !board) return;

    if (board.hasPointerCapture(event.pointerId)) {
      board.releasePointerCapture(event.pointerId);
    }
    delete board.dataset.panning;
    panStateRef.current = null;
  }

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

  function handleCreateColumn(name = "Nova coluna") {
    if (!tenantId) return;
    startTransition(async () => {
      const column = await createKanbanColumn(tenantId, name);
      setLocalColumns((current) => [...current, {
        id: column.id,
        name: column.name,
        position: column.position,
        color: column.color,
        isDefault: column.is_default,
      }]);
    });
  }

  function syncNow() {
    setSyncMessage(null);
    startTransition(async () => {
      try {
        const result = await syncTenantDataJudNow();
        setSyncMessage(`${result.atualizados} atualizados, ${result.sem_mudanca} sem mudanca e ${result.nao_encontrados} nao encontrados.`);
      } catch (error) {
        setSyncMessage(error instanceof Error ? error.message : "Nao foi possivel sincronizar o DataJud.");
      }
    });
  }

  function addNewColumn() {
    const cleanName = newColumnName.trim();
    if (!cleanName) return;
    handleCreateColumn(cleanName);
    setCreatingNewColumn(false);
    setNewColumnName("");
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

  function handleDeleteColumn(column: KanbanColumn, processCount: number) {
    if (processCount === 0) {
      setLocalColumns((current) => current.filter((item) => item.id !== column.id));
      startTransition(async () => {
        await deleteKanbanColumn(column.id, column.id);
      });
    } else {
      setDeleteColumn({ ...column, processCount });
    }
  }

  function handleConfirmDelete(column: KanbanColumn, targetColumnId: string | null) {
    if (targetColumnId) {
      setLocalProcesses((current) => current.map((process) => (
        process.kanbanColumnId === column.id ? { ...process, kanbanColumnId: targetColumnId } : process
      )));
    }
    setLocalColumns((current) => current.filter((item) => item.id !== column.id));
    setDeleteColumn(null);
    startTransition(async () => {
      await deleteKanbanColumn(column.id, targetColumnId ?? column.id);
    });
  }

  return (
    <div className="grid w-full items-start gap-6 xl:grid-cols-[minmax(0,1fr)_290px]">
      <main className="min-w-0 space-y-6">
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
                ["kanban", KanbanSquare, "Quadro"],
                ["mural", Megaphone, "Mural"],
              ].map(([value, Icon, label]) => (
                <button
                  key={value as string}
                  type="button"
                  onClick={() => setView(value as "lista" | "kanban" | "mural")}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    view === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label as string}
                </button>
              ))}
            </div>

            <div className="flex min-w-[260px] flex-1 flex-wrap items-center justify-end gap-2">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Filtrar por CNJ, parte, tribunal ou tag"
                onServerSearch={globalSearch}
                className="flex-1 md:max-w-md"
              />
              <Button type="button" variant="outline" size="sm" onClick={syncNow} disabled={isPending || !tenantId}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isPending && "animate-spin")} />
                Sincronizar agora
              </Button>
            </div>
          </div>

          {syncMessage ? <div className="rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm text-[var(--tenant-surface-foreground)]">{syncMessage}</div> : null}

          {view === "lista" ? (
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <EmptyState />
              ) : (
                visibleProcesses.map((process) => <ProcessCard key={process.id} process={process} onOpen={setSelectedProcessId} />)
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
              <div
                ref={boardScrollRef}
                onPointerDown={handleBoardPointerDown}
                onPointerMove={handleBoardPointerMove}
                onPointerUp={endBoardPan}
                onPointerCancel={endBoardPan}
                className="overflow-x-auto pb-2 data-[panning=true]:cursor-grabbing"
              >
                <SortableContext items={localColumns.map((column) => column.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-h-[500px] gap-4 rounded-md" data-kanban-board>
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
                        onDeleteColumn={(column) => handleDeleteColumn(column, localProcesses.filter((process) => process.kanbanColumnId === column.id).length)}
                        onOpenProcess={setSelectedProcessId}
                      />
                    ))}
                    <div className="w-[320px] shrink-0">
                      {creatingNewColumn ? (
                        <div className="flex h-[min(68vh,720px)] min-h-[460px] flex-col justify-center rounded-lg border-2 border-dashed border-[var(--tenant-brass)] bg-[var(--tenant-surface-muted)] p-4">
                          <input
                            autoFocus
                            value={newColumnName}
                            onChange={(event) => setNewColumnName(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter" && newColumnName.trim()) addNewColumn(); if (event.key === "Escape") { setCreatingNewColumn(false); setNewColumnName(""); } }}
                            placeholder="Nome da coluna..."
                            className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none focus:ring-2 focus:ring-primary"
                          />
                          <div className="mt-3 flex gap-2">
                            <Button type="button" size="sm" disabled={!newColumnName.trim() || isPending} onClick={addNewColumn}>Criar coluna</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => { setCreatingNewColumn(false); setNewColumnName(""); }}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!tenantId || isPending}
                          onClick={() => { setNewColumnName(""); setCreatingNewColumn(true); }}
                          className="flex h-[min(68vh,720px)] min-h-[460px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--tenant-brass)] hover:text-[var(--tenant-brass)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plus className="h-7 w-7" />
                          <span className="text-sm font-medium">Adicionar coluna</span>
                          <span className="text-xs">Organize o fluxo do escritório</span>
                        </button>
                      )}
                    </div>
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

          {view !== "mural" && filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--tenant-line)] pt-4 text-sm text-[var(--color-muted-foreground)]">
              <span>
                Mostrando {currentPage * MONITOR_PAGE_SIZE + 1}-{Math.min((currentPage + 1) * MONITOR_PAGE_SIZE, filtered.length)} de {filtered.length} processos
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Anterior
                </Button>
                <span className="min-w-24 text-center text-xs font-medium text-[var(--tenant-surface-foreground)]">
                  Página {currentPage + 1} de {totalPages}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage((value) => Math.min(totalPages - 1, value + 1))}
                >
                  Próxima
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
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
                        <Badge className="bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[var(--tenant-brass)]">
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

      </main>
      <TodayAgendaPanel items={agendaItems} onOpenProcess={setSelectedProcessId} />

      {deleteColumn ? (
        <DeleteColumnDialog
          column={deleteColumn}
          columns={localColumns}
          onCancel={() => setDeleteColumn(null)}
          onConfirm={(targetColumnId) => handleConfirmDelete(deleteColumn, targetColumnId)}
        />
      ) : null}
      <ProcessDetailsModal processId={selectedProcessId} onClose={() => setSelectedProcessId(null)} />
    </div>
  );
}
