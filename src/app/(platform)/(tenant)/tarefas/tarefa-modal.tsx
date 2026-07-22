"use client";

import { useState, useTransition, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { displayUserName } from "@/lib/auth/display-name";
import { deleteTask, updateTask, type TaskUpdateData } from "./actions";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  priority: "alta" | "media" | "baixa";
  due_date: string | null;
  kanban_column_id: string | null;
  created_by: string | null;
  responsible_id: string | null;
  processo_id: string | null;
  assigned_to: string[];
  parent_task_id: string | null;
  is_private: boolean;
  visibility: "public" | "private";
  checklist: { id: string; label: string; done: boolean }[];
  comments: { id: string; authorId: string; message: string; createdAt: string }[];
  attachments: { id: string; name: string; type: string; url: string; source: string }[];
};

type UserProfile = { id: string; name: string; nickname: string | null; email: string; oab_number: string | null; oab_uf: string | null; avatar_url: string | null };

const priorityLabels: Record<TaskItem["priority"], string> = {
  alta: "Alta",
  media: "Media",
  baixa: "Baixa",
};

const controlClass =
  "border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] placeholder:text-[var(--color-muted-foreground)] focus-visible:ring-[var(--tenant-brass)]";

export function normalizeTask(task: TaskItem): TaskItem {
  return {
    ...task,
    checklist: task.checklist ?? [],
    comments: task.comments ?? [],
    attachments: task.attachments ?? [],
    assigned_to: task.assigned_to ?? [],
    is_private: task.is_private ?? false,
    visibility: task.visibility ?? "public",
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nao foi possivel salvar esta alteracao.";
}

function userInitials(user: UserProfile) {
  return displayUserName(user)
    .split(/[ @.]+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TarefaModal({
  task,
  columns,
  users,
  allTasks,
  currentUser,
  tenantId,
  open,
  onClose,
  onTaskChange,
  onTaskCreate,
  onTaskDelete,
}: {
  task: TaskItem;
  columns: { id: string; name: string; color: string }[];
  users: UserProfile[];
  allTasks: TaskItem[];
  currentUser: UserProfile;
  tenantId: string;
  open: boolean;
  onClose: () => void;
  onTaskChange?: (task: TaskItem) => void;
  onTaskCreate?: (task: TaskItem) => void;
  onTaskDelete?: (taskId: string) => void;
}) {
  const [localTask, setLocalTask] = useState<TaskItem>(normalizeTask(task));
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [newComment, setNewComment] = useState("");
  const [newAttachmentUrl, setNewAttachmentUrl] = useState("");
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  const subtasks = allTasks.filter((item) => item.parent_task_id === localTask.id);
  const parentTask = localTask.parent_task_id ? allTasks.find((item) => item.id === localTask.parent_task_id) ?? (task.id === localTask.parent_task_id ? task : null) : null;
  const doneSubtasks = subtasks.filter((item) => {
    const column = columns.find((col) => col.id === item.kanban_column_id);
    return column && /conclu/i.test(column.name);
  }).length;
  const doneChecklist = (localTask.checklist ?? []).filter((item) => item.done).length;
  const createdBy = users.find((user) => user.id === localTask.created_by) ?? (localTask.created_by === currentUser.id ? currentUser : null);
  const assignedUsers = users.filter((user) => (localTask.assigned_to ?? []).includes(user.id));
  const availableAssignees = users.filter((user) => !(localTask.assigned_to ?? []).includes(user.id));
  const completedColumn = columns.find((column) => /conclu/i.test(column.name));
  const firstOpenColumn = columns.find((column) => !/conclu/i.test(column.name));
  const isCompleted = Boolean(completedColumn && localTask.kanban_column_id === completedColumn.id);
  const isSubtask = Boolean(localTask.parent_task_id);
  const taskSurfaceClass = isSubtask
    ? "bg-[var(--tenant-subtask-surface)]"
    : "bg-[var(--tenant-surface)]";

  function openTask(nextTask: TaskItem) {
    setSaveError(null);
    setSubtaskTitle("");
    setNewChecklistItem("");
    setNewComment("");
    setNewAttachmentUrl("");
    setLocalTask(normalizeTask(nextTask));
  }

  function patch(update: TaskUpdateData) {
    const previous = localTask;
    setLocalTask((current) => ({ ...current, ...update }) as TaskItem);
    setSaveError(null);
    startTransition(async () => {
      try {
        const saved = normalizeTask((await updateTask(localTask.id, update)) as TaskItem);
        setLocalTask(saved);
        onTaskChange?.(saved);
      } catch (error) {
        setLocalTask(previous);
        setSaveError(getErrorMessage(error));
      }
    });
  }

  function toggleCompleted() {
    if (!completedColumn) return;
    patch({ kanban_column_id: isCompleted ? firstOpenColumn?.id ?? null : completedColumn.id });
  }

  function handleDelete() {
    setSaveError(null);
    startTransition(async () => {
      try {
        await deleteTask(localTask.id);
        onTaskDelete?.(localTask.id);
        if (localTask.id === task.id) {
          onClose();
        } else {
          openTask(parentTask ?? task);
        }
      } catch (error) {
        setSaveError(getErrorMessage(error));
      }
    });
  }

  function addSubtask(event: FormEvent) {
    event.preventDefault();
    if (!subtaskTitle.trim()) return;
    setSaveError(null);
    startTransition(async () => {
      try {
        const { createTask } = await import("./actions");
        const created = normalizeTask(
          (await createTask(tenantId, columns[0]?.id ?? "", subtaskTitle, "", "media", { parent_task_id: localTask.id })) as TaskItem,
        );
        onTaskCreate?.(created);
        setSubtaskTitle("");
      } catch (error) {
        setSaveError(getErrorMessage(error));
      }
    });
  }

  function removeAssigned(userId: string) {
    const updated = (localTask.assigned_to ?? []).filter((id) => id !== userId);
    patch({ assigned_to: updated, responsible_id: updated[0] ?? null });
  }

  function addAssigned(userId: string) {
    if (userId === "none" || (localTask.assigned_to ?? []).includes(userId)) return;
    const updated = [...(localTask.assigned_to ?? []), userId];
    patch({ assigned_to: updated, responsible_id: updated[0] ?? null });
  }

  function toggleChecklistItem(itemId: string) {
    const updated = (localTask.checklist ?? []).map((item) => (item.id === itemId ? { ...item, done: !item.done } : item));
    patch({ checklist: updated });
  }

  function deleteChecklistItem(itemId: string) {
    patch({ checklist: (localTask.checklist ?? []).filter((item) => item.id !== itemId) });
  }

  function addChecklistItem(event: FormEvent) {
    event.preventDefault();
    if (!newChecklistItem.trim()) return;
    patch({ checklist: [...(localTask.checklist ?? []), { id: crypto.randomUUID(), label: newChecklistItem.trim(), done: false }] });
    setNewChecklistItem("");
  }

  function updateChecklistLabel(itemId: string, label: string) {
    const updated = (localTask.checklist ?? []).map((item) => (item.id === itemId ? { ...item, label } : item));
    patch({ checklist: updated });
  }

  function addComment(event: FormEvent) {
    event.preventDefault();
    if (!newComment.trim()) return;
    const comment = { id: crypto.randomUUID(), authorId: currentUser.id, message: newComment.trim(), createdAt: new Date().toISOString() };
    patch({ comments: [...(localTask.comments ?? []), comment] });
    setNewComment("");
  }

  function addAttachment(event: FormEvent) {
    event.preventDefault();
    if (!newAttachmentUrl.trim()) return;
    const attachment = { id: crypto.randomUUID(), name: newAttachmentUrl.trim(), type: "link", url: newAttachmentUrl.trim(), source: "external" };
    patch({ attachments: [...(localTask.attachments ?? []), attachment] });
    setNewAttachmentUrl("");
  }

  function removeAttachment(attachmentId: string) {
    patch({ attachments: (localTask.attachments ?? []).filter((attachment) => attachment.id !== attachmentId) });
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent
        className={cn("max-h-[92vh] max-w-[min(1200px,calc(100vw-32px))] overflow-y-auto border-[var(--tenant-line)] !p-0 !text-[var(--tenant-surface-foreground)] shadow-2xl", taskSurfaceClass)}
        style={{ color: "var(--tenant-surface-foreground)" }}
      >
        <DialogHeader className={cn("sticky top-0 z-10 border-b border-[var(--tenant-line)] px-6 py-4", taskSurfaceClass)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleCompleted}
                disabled={!completedColumn}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50",
                  isCompleted
                    ? "border-green-200 bg-green-100 text-green-800"
                    : "border-[var(--tenant-line)] text-[var(--color-muted-foreground)] hover:border-[var(--tenant-brass)] hover:bg-[color-mix(in_srgb,var(--tenant-brass)_8%,transparent)]",
                )}
              >
                <CheckCircle2 size={17} />
                {isCompleted ? "Concluida" : completedColumn ? "Marcar como concluida" : "Sem coluna concluida"}
              </button>

              <Select value={localTask.priority} onValueChange={(value) => patch({ priority: value as TaskItem["priority"] })}>
                <SelectTrigger className={cn("w-[130px] rounded-2xl", controlClass)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                  <SelectItem value="alta">{priorityLabels.alta}</SelectItem>
                  <SelectItem value="media">{priorityLabels.media}</SelectItem>
                  <SelectItem value="baixa">{priorityLabels.baixa}</SelectItem>
                </SelectContent>
              </Select>

              {parentTask ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => openTask(parentTask)}
                  className="rounded-2xl border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Voltar para tarefa principal
                </Button>
              ) : null}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="rounded-2xl border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
            >
              <Trash2 size={15} className="mr-1" />
              Excluir
            </Button>
          </div>
        </DialogHeader>

        <div key={localTask.id} className={cn("animate-fade-in-up space-y-6 px-6 py-5", taskSurfaceClass)}>
          <Input
            value={localTask.title}
            onChange={(event) => patch({ title: event.target.value })}
            className="border-0 bg-transparent px-0 py-1 text-3xl font-black text-[var(--tenant-surface-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)] focus-visible:ring-0"
          />

          {saveError ? (
            <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>Nao foi possivel salvar esta alteracao.</p>
                <p className="mt-1 font-normal">{saveError}</p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <DetailRow label="Criado por">
              <UserPill user={createdBy} fallback="Sem autor registrado" />
            </DetailRow>

            <DetailRow label="Atribuicao">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {assignedUsers.length ? (
                    assignedUsers.map((user) => (
                      <span
                        key={user.id}
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2.5 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)]"
                      >
                        <AvatarInitials user={user} />
                        {displayUserName(user)}
                        <button
                          type="button"
                          onClick={() => removeAssigned(user.id)}
                          className="rounded-full p-0.5 text-[var(--color-muted-foreground)] hover:bg-red-50 hover:text-red-700"
                          title="Remover atribuicao"
                        >
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))
                  ) : (
                    <span className="text-sm font-medium text-[var(--color-muted-foreground)]">Nenhuma pessoa atribuida.</span>
                  )}
                </div>

                <Select value="" onValueChange={addAssigned}>
                  <SelectTrigger className={cn("rounded-2xl", controlClass)}>
                    <SelectValue placeholder="Adicionar responsavel" />
                  </SelectTrigger>
                  <SelectContent className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                    {availableAssignees.length ? (
                      availableAssignees.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {displayUserName(user)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="none" disabled>
                        Todos ja foram atribuidos
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </DetailRow>

            <DetailRow label="Visibilidade">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => patch({ is_private: false, visibility: "public" })}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition-all",
                    !localTask.is_private
                      ? "border-[var(--tenant-brass)] bg-[var(--tenant-brass)] text-white"
                      : "border-[var(--tenant-line)] text-[var(--color-muted-foreground)] hover:border-[var(--tenant-brass)] hover:bg-[color-mix(in_srgb,var(--tenant-brass)_8%,transparent)]",
                  )}
                >
                  <Eye size={16} />
                  Publico
                </button>
                <button
                  type="button"
                  onClick={() => patch({ is_private: true, visibility: "private" })}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition-all",
                    localTask.is_private
                      ? "border-red-300 bg-red-100 text-red-800"
                      : "border-[var(--tenant-line)] text-[var(--color-muted-foreground)] hover:border-red-300 hover:bg-red-50",
                  )}
                >
                  <EyeOff size={16} />
                  So eu
                </button>
              </div>
            </DetailRow>

            {!isSubtask ? (
              <DetailRow label="Coluna">
                <Select value={localTask.kanban_column_id ?? undefined} onValueChange={(value) => patch({ kanban_column_id: value })}>
                  <SelectTrigger className={cn("rounded-2xl", controlClass)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                    {columns.map((column) => (
                      <SelectItem key={column.id} value={column.id}>
                        {column.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DetailRow>
            ) : null}

            {localTask.processo_id ? (
              <DetailRow label="Processo vinculado">
                <span className="text-[var(--color-muted-foreground)]">{localTask.processo_id}</span>
              </DetailRow>
            ) : null}
          </div>

          <Section title="Subtarefas" count={`${doneSubtasks}/${subtasks.length}`}>
            <form onSubmit={addSubtask} className="flex gap-2">
              <Input
                value={subtaskTitle}
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Nova subtarefa"
                className={cn("rounded-2xl", controlClass)}
              />
              <Button type="submit" size="sm" disabled={!subtaskTitle.trim()} className="rounded-2xl bg-[var(--tenant-brass)] text-white disabled:opacity-50">
                <Plus size={17} />
              </Button>
            </form>

            <div className="divide-y divide-[var(--tenant-line)] rounded-2xl border border-[var(--tenant-line)]">
              {subtasks.map((subtask) => {
                const subtaskColumn = columns.find((column) => column.id === subtask.kanban_column_id);
                const subtaskDone = Boolean(subtaskColumn && /conclu/i.test(subtaskColumn.name));

                return (
                  <button
                    key={subtask.id}
                    type="button"
                    onClick={() => openTask(subtask)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-[color-mix(in_srgb,var(--tenant-brass)_5%,transparent)]"
                  >
                    <span
                      className={cn(
                        "grid h-7 w-7 shrink-0 place-items-center rounded-full border",
                        subtaskDone ? "border-green-200 bg-green-100 text-green-700" : "border-[var(--tenant-line)] bg-[var(--tenant-surface)]",
                      )}
                    >
                      <CheckCircle2 size={17} />
                    </span>
                    <span className={cn("min-w-0 flex-1 text-left font-bold", subtaskDone && "text-green-700 line-through")}>{subtask.title}</span>
                  </button>
                );
              })}
              {!subtasks.length ? <p className="px-3 py-3 text-sm font-bold text-[var(--color-muted-foreground)]">Nenhuma subtarefa criada.</p> : null}
            </div>
          </Section>

          <Section title="Checklist" count={`${doneChecklist}/${(localTask.checklist ?? []).length}`}>
            <div className="space-y-2">
              {(localTask.checklist ?? []).map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-3">
                  <input type="checkbox" checked={item.done} onChange={() => toggleChecklistItem(item.id)} className="h-4 w-4 accent-[var(--tenant-brass)]" />
                  <input
                    value={item.label}
                    onChange={(event) => updateChecklistLabel(item.id, event.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-bold text-[var(--tenant-surface-foreground)] outline-none"
                  />
                  <button type="button" onClick={() => deleteChecklistItem(item.id)} className="rounded-xl bg-red-100 p-2 text-red-700" title="Excluir">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <form onSubmit={addChecklistItem} className="flex gap-2">
              <Input
                value={newChecklistItem}
                onChange={(event) => setNewChecklistItem(event.target.value)}
                placeholder="Novo item"
                className={cn("rounded-2xl", controlClass)}
              />
              <Button type="submit" size="sm" disabled={!newChecklistItem.trim()} className="rounded-2xl bg-[var(--tenant-brass)] text-white disabled:opacity-50">
                <Plus size={17} />
              </Button>
            </form>
          </Section>

          <Section title="Descricao" count="">
            <textarea
              value={localTask.description ?? ""}
              rows={7}
              placeholder="Do que se trata esta tarefa?"
              onChange={(event) => patch({ description: event.target.value || null })}
              className={cn("w-full resize-none rounded-3xl px-4 py-3 outline-none focus:border-[var(--tenant-brass)]", controlClass)}
            />
          </Section>

          <Section title="Anexos" id="attachments-section" count="">
            <form onSubmit={addAttachment} className="flex gap-2">
              <Input
                value={newAttachmentUrl}
                onChange={(event) => setNewAttachmentUrl(event.target.value)}
                placeholder="Cole um link"
                className={cn("rounded-2xl", controlClass)}
              />
              <Button type="submit" size="sm" disabled={!newAttachmentUrl.trim()} className="rounded-2xl bg-[var(--tenant-brass)] text-white disabled:opacity-50">
                <Plus size={16} />
              </Button>
            </form>

            <div className="space-y-2">
              {(localTask.attachments ?? []).map((attachment) => (
                <div key={attachment.id} className="flex items-center justify-between rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-3 text-sm font-bold">
                  <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[var(--tenant-brass)] hover:underline">
                    <Paperclip size={14} />
                    {attachment.name}
                    <ExternalLink size={12} />
                  </a>
                  <button type="button" onClick={() => removeAttachment(attachment.id)} className="rounded-xl bg-red-100 p-1.5 text-red-700 hover:bg-red-200">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className={cn("sticky bottom-0 border-t border-[var(--tenant-line)] px-6 py-4", taskSurfaceClass)}>
          <form onSubmit={addComment} className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tenant-surface-muted)] font-mono text-xs font-bold text-[var(--tenant-surface-foreground)]">
              {userInitials(currentUser)}
            </div>
            <Input
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              placeholder="Adicionar um comentario"
              className={cn("rounded-2xl", controlClass)}
            />
            <Button type="submit" size="sm" disabled={!newComment.trim()} className="rounded-2xl bg-[var(--tenant-brass)] text-white disabled:opacity-50">
              <MessageSquare size={17} />
            </Button>
          </form>

          <div className="mt-3 space-y-2">
            {(localTask.comments ?? []).map((comment) => (
              <div key={comment.id} className="rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-3">
                <p className="font-black">{users.find((user) => user.id === comment.authorId)?.name ?? "Usuario"}</p>
                <p className="text-sm text-[var(--color-muted-foreground)]">{comment.message}</p>
              </div>
            ))}
          </div>
        </div>

        {isPending ? (
          <div className="fixed bottom-4 right-4 rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-4 py-2 shadow-lg">
            <Loader2 size={16} className="mr-2 inline animate-spin" />
            <span className="text-sm font-bold text-[var(--color-muted-foreground)]">Salvando...</span>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-4 py-3 md:grid-cols-[150px_1fr] md:items-center">
      <p className="text-sm font-black text-[var(--color-muted-foreground)]">{label}</p>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function AvatarInitials({ user }: { user: UserProfile }) {
  return (
    user.avatar_url ? <img src={user.avatar_url} alt={displayUserName(user)} className="h-6 w-6 shrink-0 rounded-full object-cover" /> : <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--tenant-surface-muted)] font-mono text-[10px] font-black text-[var(--tenant-surface-foreground)]">{userInitials(user)}</span>
  );
}

function UserPill({ user, fallback }: { user: UserProfile | null; fallback: string }) {
  if (!user) return <span className="text-sm font-medium text-[var(--color-muted-foreground)]">{fallback}</span>;

  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2.5 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)]">
      <AvatarInitials user={user} />
      <span className="min-w-0 truncate">{displayUserName(user)}</span>
    </span>
  );
}

function Section({ title, count, id, children }: { title: string; count: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 border-t border-[var(--tenant-line)] pt-4">
      <div className="flex items-center gap-2">
        <h3 className="font-black text-[var(--tenant-surface-foreground)]">{title}</h3>
        {count ? <Badge className="rounded-full bg-[var(--tenant-surface-muted)] text-[var(--color-muted-foreground)]">{count}</Badge> : null}
      </div>
      {children}
    </section>
  );
}
