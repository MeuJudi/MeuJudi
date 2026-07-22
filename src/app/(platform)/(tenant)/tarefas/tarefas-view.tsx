"use client";

import { useMemo, useState, useTransition } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, Check, CheckCircle2, CircleDotDashed, GripVertical, KanbanSquare, ListFilter, Plus, Trash2, X } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { globalSearch } from "@/components/ui/search-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { createTask, createTaskColumn, deleteTaskColumn, moveTask, renameTaskColumn, reorderTaskColumns } from "./actions";
import { TarefaModal, normalizeTask, type TaskItem } from "./tarefa-modal";
import { displayUserName } from "@/lib/auth/display-name";
export type { TaskItem };

export type TaskColumn = { id: string; name: string; position: number; color: string; is_default: boolean };
export type TaskUser = { id: string; name: string; nickname: string | null; email: string; oab_number: string | null; oab_uf: string | null; avatar_url: string | null };

const priorityClass = {
  alta: "bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] text-[var(--tenant-wine)]",
  media: "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[var(--tenant-brass)]",
  baixa: "bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] text-[var(--tenant-moss)]",
};
const priorityLabel = { alta: "Alta", media: "Média", baixa: "Baixa" };

function isCompletedColumnName(name: string) {
  return /conclu/i.test(name);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "NÃ£o foi possÃ­vel salvar esta alteraÃ§Ã£o.";
}

function initials(user: TaskUser) {
  return displayUserName(user).split(/[ @.]+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function TaskAvatar({ user }: { user: TaskUser }) {
  return user.avatar_url ? <img src={user.avatar_url} alt={displayUserName(user)} className="h-7 w-7 rounded-full border-2 border-[var(--tenant-surface)] object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--tenant-surface)] bg-[var(--tenant-surface-muted)] font-mono text-[10px] font-semibold text-[var(--tenant-surface-foreground)]">{initials(user)}</span>;
}

function TaskCard({ task, users, completed, handle, onClick }: { task: TaskItem; users: TaskUser[]; completed?: boolean; handle?: React.ReactNode; onClick?: () => void }) {
  const assignedUsers = users.filter((user) => task.assigned_to.includes(user.id));
  return (
    <Card
      onClick={onClick}
      className={cn(
        "border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] shadow-sm transition-shadow hover:shadow-md",
        completed && "border-[color-mix(in_srgb,var(--tenant-moss)_35%,var(--tenant-line))] bg-[color-mix(in_srgb,var(--tenant-moss)_8%,var(--tenant-surface))]",
        onClick && "cursor-pointer",
      )}
    >
      <CardContent className="p-3">
        <div className="flex gap-2">
          {handle}
          <p className={cn("min-w-0 flex-1 font-semibold text-[var(--tenant-surface-foreground)]", completed && "text-green-800 line-through decoration-green-700/50")}>{task.title}</p>
          {completed ? (
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[color-mix(in_srgb,var(--tenant-moss)_35%,var(--tenant-line))] bg-[color-mix(in_srgb,var(--tenant-moss)_12%,transparent)] text-[var(--tenant-moss)]" title="Concluída">
              <CheckCircle2 className="h-4 w-4" />
            </span>
          ) : null}
        </div>
        {task.description ? <p className="mt-2 text-sm leading-5 text-[var(--color-muted-foreground)] line-clamp-2">{task.description}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={cn("border-transparent uppercase tracking-wide", priorityClass[task.priority])}>{priorityLabel[task.priority]}</Badge>
          {task.due_date && <Badge className="rounded-full bg-[var(--tenant-surface-muted)] text-[var(--color-muted-foreground)]">{new Date(task.due_date).toLocaleDateString("pt-BR")}</Badge>}
          {(task.checklist?.length ?? 0) > 0 && <Badge className="rounded-full bg-[var(--tenant-surface-muted)] text-[var(--color-muted-foreground)]">{task.checklist.filter((i) => i.done).length}/{task.checklist.length}</Badge>}
        </div>
        {assignedUsers.length ? <div className="mt-3 flex items-center gap-2 border-t border-[var(--tenant-line)] pt-3"><div className="flex -space-x-2">{assignedUsers.slice(0, 4).map((user) => <TaskAvatar key={user.id} user={user} />)}</div><span className="truncate text-xs text-[var(--color-muted-foreground)]">{assignedUsers.length === 1 ? displayUserName(assignedUsers[0]) : `${assignedUsers.length} responsáveis`}</span></div> : null}
      </CardContent>
    </Card>
  );
}

function SortableTask({ task, users, completed, onClick }: { task: TaskItem; users: TaskUser[]; completed?: boolean; onClick?: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, data: { type: "task", columnId: task.kanban_column_id } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")} data-kanban-card>
      <TaskCard task={task} users={users} completed={completed} onClick={onClick} handle={<button type="button" aria-label="Arrastar tarefa" className="cursor-grab text-[var(--color-muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>} />
    </div>
  );
}

function Column({ column, tasks, users, completed, editing, draft, onEdit, onDraft, onSave, onCancel, onDelete, onTaskClick, creating, newTaskTitle, onNewTaskTitleChange, onCreateTask, onCreateTaskCancel, onCreateTaskConfirm }: { column: TaskColumn; tasks: TaskItem[]; users: TaskUser[]; completed: boolean; editing: boolean; draft: string; onEdit: () => void; onDraft: (value: string) => void; onSave: () => void; onCancel: () => void; onDelete: (taskCount: number) => void; onTaskClick: (taskId: string) => void; creating: boolean; newTaskTitle: string; onNewTaskTitleChange: (value: string) => void; onCreateTask: () => void; onCreateTaskCancel: () => void; onCreateTaskConfirm: () => void }) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: "column" } });
  return (
    <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} data-kanban-column className={cn("flex h-[min(68vh,720px)] min-h-[460px] w-[320px] shrink-0 flex-col rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 text-[var(--tenant-surface-foreground)]", isDragging && "opacity-50", isOver && "ring-2 ring-primary")}>
      <header className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Arrastar coluna" className="cursor-grab text-[var(--color-muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: column.color }} />
          {editing ? <input autoFocus value={draft} onChange={(event) => onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSave(); if (event.key === "Escape") onCancel(); }} className="min-w-0 flex-1 rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none" /> : <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-[var(--tenant-surface-foreground)]">{column.name}</button>}
          <span className="rounded-full bg-[var(--tenant-surface)] px-2 py-0.5 font-mono text-xs">{tasks.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>{editing ? <><Button size="sm" className="mr-1 h-7 px-2" onClick={onSave}><Check className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" className="h-7 px-2" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button></> : <p className="text-xs text-[var(--color-muted-foreground)]">Arraste tarefas para esta coluna</p>}</div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-[var(--tenant-brass)]" onClick={() => { onNewTaskTitleChange(""); onCreateTask(); }} title="Adicionar tarefa"><Plus className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[var(--tenant-wine)]" onClick={() => onDelete(tasks.length)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        </div>
      </header>
      <div ref={dropRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => <SortableTask key={task.id} task={task} users={users} completed={completed} onClick={() => onTaskClick(task.id)} />)}
        </SortableContext>
        {creating && (
          <div className="rounded-lg border border-[var(--tenant-brass)] bg-[var(--tenant-surface)] p-2">
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(e) => onNewTaskTitleChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newTaskTitle.trim()) onCreateTask(); if (e.key === "Escape") onCreateTaskCancel(); }}
              placeholder="Nome da tarefa..."
              className="w-full bg-transparent px-2 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
            />
            <div className="mt-2 flex gap-1">
              <Button size="sm" className="h-7 px-3 text-xs" disabled={!newTaskTitle.trim()} onClick={onCreateTaskConfirm}>Criar</Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onCreateTaskCancel}>Cancelar</Button>
            </div>
          </div>
        )}
        {tasks.length === 0 && !creating ? <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">Arraste tarefas para esta coluna</div> : null}
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

export function TarefasView({ tenantId, columns, tasks, users, currentUser, loadError }: { tenantId: string | null; columns: TaskColumn[]; tasks: TaskItem[]; users: TaskUser[]; currentUser: TaskUser; loadError?: string | null }) {
  const [view, setView] = useState<"kanban" | "lista">("kanban");
  const [localColumns, setColumns] = useState(columns);
  const [localTasks, setTasks] = useState(tasks);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<TaskItem | null>(null);
  const [deleting, setDeleting] = useState<(TaskColumn & { taskCount: number }) | null>(null);
  const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [creatingNewColumn, setCreatingNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [isMutating, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(loadError ?? null);

  const topLevelTasks = useMemo(() => localTasks.filter((task) => !task.parent_task_id), [localTasks]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? topLevelTasks.filter((task) => `${task.title} ${task.description ?? ""} ${priorityLabel[task.priority]}`.toLowerCase().includes(term)) : topLevelTasks;
  }, [query, topLevelTasks]);

  const grouped = useMemo(() => localColumns.map((column) => ({ ...column, tasks: filtered.filter((task) => task.kanban_column_id === column.id) })), [localColumns, filtered]);

  const selectedTask = selectedTaskId ? localTasks.find((t) => t.id === selectedTaskId) ?? null : null;

  function dragEnd(event: DragEndEvent) {
    setActive(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type, overType = over.data.current?.type;
    if (type === "column" && overType === "column") {
      const oldIndex = localColumns.findIndex((x) => x.id === active.id), newIndex = localColumns.findIndex((x) => x.id === over.id);
      const ordered = arrayMove(localColumns, oldIndex, newIndex).map((x, position) => ({ ...x, position }));
      const previous = localColumns;
      setColumns(ordered);
      setMutationError(null);
      startTransition(async () => {
        try {
          await reorderTaskColumns(ordered.map((x) => x.id));
        } catch (error) {
          setColumns(previous);
          setMutationError(getErrorMessage(error));
        }
      });
    }
    if (type === "task") {
      const target = overType === "task" ? String(over.data.current?.columnId) : String(over.id);
      const task = localTasks.find((x) => x.id === active.id);
      if (!task || task.kanban_column_id === target || !localColumns.some((x) => x.id === target)) return;
      const previous = localTasks;
      setTasks((current) => current.map((x) => x.id === task.id ? { ...x, kanban_column_id: target } : x));
      setMutationError(null);
      startTransition(async () => {
        try {
          await moveTask(task.id, target);
        } catch (error) {
          setTasks(previous);
          setMutationError(getErrorMessage(error));
        }
      });
    }
  }

  function handleDeleteColumn(column: TaskColumn, taskCount: number) {
    if (taskCount === 0) {
      const previous = localColumns;
      setColumns((current) => current.filter((x) => x.id !== column.id));
      setMutationError(null);
      startTransition(async () => {
        try {
          await deleteTaskColumn(column.id, null);
        } catch (error) {
          setColumns(previous);
          setMutationError(getErrorMessage(error));
        }
      });
    } else {
      setDeleting({ ...column, taskCount });
    }
  }

  function handleConfirmDelete(column: TaskColumn & { taskCount: number }, targetColumnId: string | null) {
    const previousColumns = localColumns;
    const previousTasks = localTasks;
    if (targetColumnId) {
      setTasks((current) => current.map((x) => x.kanban_column_id === column.id ? { ...x, kanban_column_id: targetColumnId } : x));
    }
    setColumns((current) => current.filter((x) => x.id !== column.id));
    setDeleting(null);
    setMutationError(null);
    startTransition(async () => {
      try {
        await deleteTaskColumn(column.id, targetColumnId);
      } catch (error) {
        setColumns(previousColumns);
        setTasks(previousTasks);
        setMutationError(getErrorMessage(error));
      }
    });
  }

  function addTaskToColumn(columnId: string) {
    if (!tenantId || !newTaskTitle.trim()) return;
    setMutationError(null);
    startTransition(async () => {
      try {
        const task = normalizeTask(await createTask(tenantId, columnId, newTaskTitle.trim(), "", "media") as TaskItem);
        setTasks((current) => [task, ...current]);
        setCreatingColumnId(null);
        setNewTaskTitle("");
      } catch (error) {
        setMutationError(getErrorMessage(error));
      }
    });
  }

  function addNewColumn() {
    if (!tenantId || !newColumnName.trim()) return;
    setMutationError(null);
    startTransition(async () => {
      try {
        const column = await createTaskColumn(tenantId);
        const clean = newColumnName.trim();
        await renameTaskColumn(column.id, clean);
        setColumns((current) => [...current, { ...column, name: clean }]);
        setCreatingNewColumn(false);
        setNewColumnName("");
      } catch (error) {
        setMutationError(getErrorMessage(error));
      }
    });
  }

  function saveColumnName(column: TaskColumn) {
    const clean = draft.trim();
    if (!clean) return;
    const previous = localColumns;
    setColumns((current) => current.map((x) => x.id === column.id ? { ...x, name: clean } : x));
    setEditingId(null);
    setMutationError(null);
    startTransition(async () => {
      try {
        await renameTaskColumn(column.id, clean);
      } catch (error) {
        setColumns(previous);
        setMutationError(getErrorMessage(error));
      }
    });
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Tarefas</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">Organize o trabalho interno do escritório em um quadro próprio, ligado ou não a processos.</p>
        </div>
        <div className="flex items-center gap-2">
          {isMutating ? <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[var(--tenant-brass)]">Salvando...</Badge> : null}
          <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">{topLevelTasks.length} tarefa{topLevelTasks.length === 1 ? "" : "s"}</Badge>
        </div>
      </header>

      {mutationError ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p>NÃ£o foi possÃ­vel salvar no Supabase.</p>
            <p className="mt-1 break-words font-normal">{mutationError}</p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        {[{ label: "Total", value: topLevelTasks.length, icon: ListFilter }, { label: "Em andamento", value: grouped.find((x) => /andamento/i.test(x.name))?.tasks.length ?? 0, icon: CircleDotDashed }, { label: "Concluídas", value: grouped.find((x) => /conclu/i.test(x.name))?.tasks.length ?? 0, icon: CheckCircle2 }].map((metric) => (
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
              {[["kanban", KanbanSquare, "Quadro"], ["lista", ListFilter, "Lista"]].map(([value, Icon, label]) => (
                <button key={value as string} type="button" onClick={() => setView(value as "kanban" | "lista")} className={cn("inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors", view === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]")}>
                  <Icon className="h-4 w-4" />{label as string}
                </button>
              ))}
            </div>
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Filtrar por titulo ou prioridade"
              onServerSearch={globalSearch}
              className="flex-1 md:max-w-md"
            />
          </div>

          {view === "kanban" ? (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event) => { if (event.active.data.current?.type === "task") setActive(localTasks.find((x) => x.id === event.active.id) ?? null); }} onDragEnd={dragEnd}>
              <div className="overflow-x-auto pb-2">
                <SortableContext items={localColumns.map((x) => x.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-h-[500px] gap-4 rounded-md">
                    {grouped.map((column) => (
                      <Column key={column.id} column={column} tasks={column.tasks} users={users} completed={isCompletedColumnName(column.name)} editing={editingId === column.id} draft={draft} onEdit={() => { setEditingId(column.id); setDraft(column.name); }} onDraft={setDraft} onSave={() => saveColumnName(column)} onCancel={() => setEditingId(null)} onDelete={(taskCount) => handleDeleteColumn(column, taskCount)} onTaskClick={(taskId) => setSelectedTaskId(taskId)} creating={creatingColumnId === column.id} newTaskTitle={newTaskTitle} onNewTaskTitleChange={setNewTaskTitle} onCreateTask={() => setCreatingColumnId(column.id)} onCreateTaskCancel={() => { setCreatingColumnId(null); setNewTaskTitle(""); }} onCreateTaskConfirm={() => addTaskToColumn(column.id)} />
                    ))}
                    <div className="w-[320px] shrink-0">
                      {creatingNewColumn ? (
                        <div className="rounded-lg border border-dashed border-[var(--tenant-brass)] bg-[var(--tenant-surface-muted)] p-3">
                          <input
                            autoFocus
                            value={newColumnName}
                            onChange={(e) => setNewColumnName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && newColumnName.trim()) addNewColumn(); if (e.key === "Escape") { setCreatingNewColumn(false); setNewColumnName(""); } }}
                            placeholder="Nome da coluna..."
                            className="w-full bg-transparent px-2 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
                          />
                          <div className="mt-2 flex gap-1">
                            <Button size="sm" className="h-7 px-3 text-xs" disabled={!newColumnName.trim()} onClick={addNewColumn}>Criar</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => { setCreatingNewColumn(false); setNewColumnName(""); }}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setNewColumnName(""); setCreatingNewColumn(true); }}
                          className="flex h-full min-h-[460px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--tenant-line)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--tenant-brass)] hover:text-[var(--tenant-brass)]"
                        >
                          <Plus className="h-6 w-6" />
                          <span className="text-sm font-medium">Nova coluna</span>
                        </button>
                      )}
                    </div>
                  </div>
                </SortableContext>
              </div>
              <DragOverlay>{active ? <div className="w-[300px] rotate-1 shadow-xl"><TaskCard task={active} users={users} completed={isCompletedColumnName(localColumns.find((column) => column.id === active.kanban_column_id)?.name ?? "")} /></div> : null}</DragOverlay>
            </DndContext>
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 ? <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-sm text-[var(--color-muted-foreground)]">Nenhuma tarefa encontrada.</div> : filtered.map((task) => <TaskCard key={task.id} task={task} users={users} completed={isCompletedColumnName(localColumns.find((column) => column.id === task.kanban_column_id)?.name ?? "")} onClick={() => setSelectedTaskId(task.id)} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {deleting ? <DeleteColumnDialog column={deleting} columns={localColumns} onCancel={() => setDeleting(null)} onConfirm={(targetColumnId) => handleConfirmDelete(deleting, targetColumnId)} /> : null}
      {selectedTask ? (
        <TarefaModal
          task={selectedTask}
          columns={localColumns}
          users={users}
          allTasks={localTasks}
          currentUser={currentUser}
          tenantId={tenantId ?? ""}
          open={true}
          onClose={() => setSelectedTaskId(null)}
          onTaskChange={(updated) => setTasks((current) => current.map((task) => task.id === updated.id ? normalizeTask(updated) : task))}
          onTaskCreate={(created) => setTasks((current) => [normalizeTask(created), ...current])}
          onTaskDelete={(taskId) => setTasks((current) => current.filter((task) => task.id !== taskId && task.parent_task_id !== taskId))}
        />
      ) : null}
    </div>
  );
}
