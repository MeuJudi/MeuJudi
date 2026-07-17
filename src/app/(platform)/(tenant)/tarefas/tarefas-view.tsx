"use client";

import { useMemo, useState, useTransition } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Check, CheckCircle2, CircleDotDashed, GripVertical, KanbanSquare, ListFilter, Plus, Search, Trash2, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createTask, createTaskColumn, deleteTaskColumn, moveTask, renameTaskColumn, reorderTaskColumns } from "./actions";

export type TaskColumn = { id: string; name: string; position: number; color: string; is_default: boolean };
export type TaskItem = { id: string; title: string; description: string | null; priority: "alta" | "media" | "baixa"; due_date: string | null; kanban_column_id: string | null };

const priorityClass = {
  alta: "bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] text-[var(--tenant-wine)]",
  media: "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[#8c6425]",
  baixa: "bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] text-[var(--tenant-moss)]",
};
const priorityLabel = { alta: "Alta", media: "Média", baixa: "Baixa" };

function TaskCard({ task, handle }: { task: TaskItem; handle?: React.ReactNode }) {
  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-3">
        <div className="flex gap-2">
          {handle}
          <p className="min-w-0 flex-1 font-semibold text-[var(--tenant-surface-foreground)]">{task.title}</p>
        </div>
        {task.description ? <p className="mt-2 text-sm leading-5 text-[var(--color-muted-foreground)]">{task.description}</p> : null}
        <Badge className={cn("mt-3 border-transparent uppercase tracking-wide", priorityClass[task.priority])}>{priorityLabel[task.priority]}</Badge>
      </CardContent>
    </Card>
  );
}

function SortableTask({ task }: { task: TaskItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: "task", columnId: task.kanban_column_id } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")} data-kanban-card>
      <TaskCard task={task} handle={<button type="button" aria-label="Arrastar tarefa" className="cursor-grab text-[var(--color-muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>} />
    </div>
  );
}

function Column({ column, tasks, editing, draft, onEdit, onDraft, onSave, onCancel, onDelete }: { column: TaskColumn; tasks: TaskItem[]; editing: boolean; draft: string; onEdit: () => void; onDraft: (value: string) => void; onSave: () => void; onCancel: () => void; onDelete: (taskCount: number) => void }) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: "column" } });
  return (
    <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-kanban-column className={cn("flex min-h-[460px] w-[320px] shrink-0 flex-col rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 text-[var(--tenant-surface-foreground)]", isDragging && "opacity-50", isOver && "ring-2 ring-primary")}>
      <header className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Arrastar coluna" className="cursor-grab text-[var(--color-muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: column.color }} />
          {editing ? <input autoFocus value={draft} onChange={(event) => onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSave(); if (event.key === "Escape") onCancel(); }} className="min-w-0 flex-1 rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none" /> : <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--tenant-surface-foreground)]">{column.name}</button>}
          <span className="rounded-full bg-[var(--tenant-surface)] px-2 py-0.5 font-mono text-xs">{tasks.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>{editing ? <><Button size="sm" className="mr-1 h-7 px-2" onClick={onSave}><Check className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" className="h-7 px-2" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button></> : <p className="text-xs text-[var(--color-muted-foreground)]">Arraste tarefas para esta coluna</p>}</div>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[var(--tenant-wine)]" onClick={() => onDelete(tasks.length)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </header>
      <div ref={dropRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => <SortableTask key={task.id} task={task} />)}
        </SortableContext>
        {tasks.length === 0 ? <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">Arraste tarefas para esta coluna</div> : null}
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
  column: TaskColumn & { taskCount: number };
  columns: TaskColumn[];
  onCancel: () => void;
  onConfirm: (targetColumnId: string | null) => void;
}) {
  const targets = columns.filter((item) => item.id !== column.id);
  const hasTasks = column.taskCount > 0;
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
            {hasTasks
              ? "As tarefas desta coluna precisam ser movidas para outra coluna antes da exclusão."
              : "Tem certeza que deseja excluir esta coluna vazia?"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasTasks && (
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
            onClick={() => onConfirm(hasTasks ? targetColumnId : null)}
            disabled={hasTasks && !targetColumnId}
          >
            {hasTasks ? "Mover e excluir" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function TarefasView({ tenantId, columns, tasks }: { tenantId: string | null; columns: TaskColumn[]; tasks: TaskItem[] }) {
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [localColumns, setColumns] = useState(columns);
  const [localTasks, setTasks] = useState(tasks);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<TaskItem | null>(null);
  const [deleting, setDeleting] = useState<(TaskColumn & { taskCount: number }) | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TaskItem["priority"]>("media");
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? localTasks.filter((task) => `${task.title} ${task.description ?? ""} ${priorityLabel[task.priority]}`.toLowerCase().includes(term)) : localTasks;
  }, [query, localTasks]);

  const grouped = useMemo(() => localColumns.map((column) => ({ ...column, tasks: filtered.filter((task) => task.kanban_column_id === column.id) })), [localColumns, filtered]);

  function dragEnd(event: DragEndEvent) {
    setActive(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type, overType = over.data.current?.type;
    if (type === "column" && overType === "column") {
      const oldIndex = localColumns.findIndex((x) => x.id === active.id), newIndex = localColumns.findIndex((x) => x.id === over.id);
      const ordered = arrayMove(localColumns, oldIndex, newIndex).map((x, position) => ({ ...x, position }));
      setColumns(ordered);
      startTransition(() => reorderTaskColumns(ordered.map((x) => x.id)));
    }
    if (type === "task") {
      const target = overType === "task" ? String(over.data.current?.columnId) : String(over.id);
      const task = localTasks.find((x) => x.id === active.id);
      if (!task || task.kanban_column_id === target || !localColumns.some((x) => x.id === target)) return;
      setTasks((current) => current.map((x) => x.id === task.id ? { ...x, kanban_column_id: target } : x));
      startTransition(() => moveTask(task.id, target));
    }
  }

  function handleDeleteColumn(column: TaskColumn, taskCount: number) {
    if (taskCount === 0) {
      setColumns((current) => current.filter((x) => x.id !== column.id));
      startTransition(async () => {
        await deleteTaskColumn(column.id, column.id);
      });
    } else {
      setDeleting({ ...column, taskCount });
    }
  }

  function handleConfirmDelete(column: TaskColumn & { taskCount: number }, targetColumnId: string | null) {
    if (targetColumnId) {
      setTasks((current) => current.map((x) => x.kanban_column_id === column.id ? { ...x, kanban_column_id: targetColumnId } : x));
    }
    setColumns((current) => current.filter((x) => x.id !== column.id));
    setDeleting(null);
    startTransition(async () => {
      await deleteTaskColumn(column.id, targetColumnId ?? column.id);
    });
  }

  function addTask() {
    if (!tenantId || !localColumns[0] || !title.trim()) return;
    const columnId = localColumns[0].id;
    startTransition(async () => {
      const task = await createTask(tenantId, columnId, title, description, priority);
      setTasks((current) => [task as TaskItem, ...current]);
      setCreating(false);
      setTitle("");
      setDescription("");
    });
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Tarefas</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">Organize o trabalho interno do escritório em um quadro próprio, ligado ou não a processos.</p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">{localTasks.length} tarefa{localTasks.length === 1 ? "" : "s"}</Badge>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {[{ label: "Total", value: localTasks.length, icon: ListFilter }, { label: "Em andamento", value: grouped.find((x) => /andamento/i.test(x.name))?.tasks.length ?? 0, icon: CircleDotDashed }, { label: "Concluídas", value: grouped.find((x) => /conclu/i.test(x.name))?.tasks.length ?? 0, icon: CheckCircle2 }].map((metric) => (
          <Card key={metric.label} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-sm text-[var(--color-muted-foreground)]">{metric.label}</p><p className="mt-1 text-3xl font-semibold">{metric.value}</p></div>
              <metric.icon className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-1">
              {[["kanban", KanbanSquare, "Kanban"], ["lista", ListFilter, "Lista"]].map(([value, Icon, label]) => (
                <button key={value as string} type="button" onClick={() => setView(value as "kanban" | "lista")} className={cn("inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors", view === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]")}>
                  <Icon className="h-4 w-4" />{label as string}
                </button>
              ))}
            </div>
            <div className="flex min-w-[260px] flex-1 flex-wrap items-center justify-end gap-2">
              {view === "kanban" ? <Button type="button" onClick={() => setCreating(true)} disabled={!tenantId || pending} className="h-9"><Plus className="h-4 w-4" />Tarefa</Button> : null}
              <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-[var(--color-muted-foreground)] md:max-w-md">
                <Search className="h-4 w-4" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtrar por titulo ou prioridade" className="w-full bg-transparent text-[var(--tenant-surface-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]" />
              </label>
            </div>
          </div>

          {creating && (
            <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1"><Label className="text-xs">Título *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Preparar petição" className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs">Descrição</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opcional" className="h-8 text-xs" /></div>
                <div className="space-y-1"><Label className="text-xs">Prioridade</Label><select value={priority} onChange={(e) => setPriority(e.target.value as TaskItem["priority"])} className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></select></div>
              </div>
              <div className="flex gap-2"><Button size="sm" className="h-8" disabled={!title.trim() || pending} onClick={addTask}>Criar</Button><Button size="sm" variant="outline" className="h-8" onClick={() => { setCreating(false); setTitle(""); setDescription(""); }}>Cancelar</Button></div>
            </div>
          )}

          {view === "kanban" ? (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event) => { if (event.active.data.current?.type === "task") setActive(localTasks.find((x) => x.id === event.active.id) ?? null); }} onDragEnd={dragEnd}>
              <div className="overflow-x-auto pb-2">
                <SortableContext items={localColumns.map((x) => x.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-h-[500px] gap-4 rounded-md">
                    {grouped.map((column) => (
                      <Column key={column.id} column={column} tasks={column.tasks} editing={editingId === column.id} draft={draft} onEdit={() => { setEditingId(column.id); setDraft(column.name); }} onDraft={setDraft} onSave={() => { const clean = draft.trim(); if (!clean) return; setColumns((current) => current.map((x) => x.id === column.id ? { ...x, name: clean } : x)); setEditingId(null); startTransition(() => renameTaskColumn(column.id, clean)); }} onCancel={() => setEditingId(null)} onDelete={(taskCount) => handleDeleteColumn(column, taskCount)} />
                    ))}
                  </div>
                </SortableContext>
              </div>
              <DragOverlay>{active ? <div className="w-[300px] rotate-1 shadow-xl"><TaskCard task={active} /></div> : null}</DragOverlay>
            </DndContext>
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 ? <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-sm text-[var(--color-muted-foreground)]">Nenhuma tarefa encontrada.</div> : filtered.map((task) => <TaskCard key={task.id} task={task} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {deleting ? <DeleteColumnDialog column={deleting} columns={localColumns} onCancel={() => setDeleting(null)} onConfirm={(targetColumnId) => handleConfirmDelete(deleting, targetColumnId)} /> : null}
    </div>
  );
}
