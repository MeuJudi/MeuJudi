"use client";

import { useMemo, useState, useTransition } from "react";
import { closestCorners, DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { AlertTriangle, Check, GripVertical, KanbanSquare, ListFilter, Mail, Phone, Plus, Trash2, Users, X } from "lucide-react";
import { SearchInput } from "@/components/ui/search-input";
import { globalSearch } from "@/components/ui/search-actions";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { createClient, createClientColumn, deleteClientColumn, moveClient, renameClientColumn, reorderClientColumns } from "./actions";

export type ClientColumn = { id: string; name: string; position: number; color: string; is_default: boolean };
export type ClientItem = { id: string; name: string; document: string | null; email: string | null; phone: string | null; notes: string | null; kanban_column_id: string | null; status: string | null; created_at: string; created_by: string | null };

const statusColors: Record<string, string> = {
  lead: "bg-[color-mix(in_srgb,var(--tenant-brass)_12%,transparent)] text-[var(--tenant-brass)]",
  contato: "bg-[color-mix(in_srgb,var(--tenant-sidebar)_12%,transparent)] text-[var(--tenant-sidebar)]",
  reuniao_agendada: "bg-[color-mix(in_srgb,var(--tenant-brass)_16%,transparent)] text-[var(--tenant-brass)]",
  proposta: "bg-[color-mix(in_srgb,var(--tenant-sidebar)_14%,transparent)] text-[var(--tenant-sidebar)]",
  fechado: "bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]",
  perdido: "bg-[color-mix(in_srgb,var(--tenant-wine)_14%,transparent)] text-[var(--tenant-wine)]",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contato: "Contato",
  reuniao_agendada: "Reunião",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

function ClientCard({ client, handle }: { client: ClientItem; handle?: React.ReactNode }) {
  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] shadow-sm transition-shadow hover:shadow-md">
      <CardContent className="p-3">
        <div className="flex gap-2">
          {handle}
          <Link href={`/clientes/${client.id}`} className="min-w-0 flex-1 font-semibold hover:underline">{client.name}</Link>
        </div>
        {client.status && <Badge className={cn("mt-1 rounded-full text-[10px]", statusColors[client.status] ?? "bg-[var(--tenant-surface-muted)] text-[var(--color-muted-foreground)]")}>{statusLabels[client.status] ?? client.status}</Badge>}
        {client.notes ? <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted-foreground)]">{client.notes}</p> : null}
        <div className="mt-3 space-y-1 text-xs text-[var(--color-muted-foreground)]">
          {client.email ? <p className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{client.email}</p> : null}
          {client.phone ? <p className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{client.phone}</p> : null}
          {client.document ? <Badge variant="outline" className="mt-1 border-[var(--tenant-line)]">{client.document}</Badge> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function SortableClient({ client }: { client: ClientItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: client.id, data: { type: "client", columnId: client.kanban_column_id } });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn(isDragging && "opacity-40")}>
      <ClientCard client={client} handle={<button type="button" aria-label="Arrastar cliente" className="cursor-grab text-[var(--color-muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>} />
    </div>
  );
}

function ClientColumnCard({ column, clients, editing, draft, onEdit, onDraft, onSave, onCancel, onDelete }: { column: ClientColumn; clients: ClientItem[]; editing: boolean; draft: string; onEdit: () => void; onDraft: (value: string) => void; onSave: () => void; onCancel: () => void; onDelete: (clientCount: number) => void }) {
  const { setNodeRef: dropRef, isOver } = useDroppable({ id: column.id, data: { type: "column" } });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: column.id, data: { type: "column" } });
  return (
    <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex h-[min(68vh,720px)] min-h-[460px] w-[320px] shrink-0 flex-col rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 text-[var(--tenant-surface-foreground)]", isDragging && "opacity-50", isOver && "ring-2 ring-primary")}>
      <header className="mb-3 space-y-2">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Arrastar coluna" className="cursor-grab text-[var(--color-muted-foreground)] active:cursor-grabbing" {...attributes} {...listeners}><GripVertical className="h-4 w-4" /></button>
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: column.color }} />
          {editing ? <input autoFocus value={draft} onChange={(event) => onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") onSave(); if (event.key === "Escape") onCancel(); }} className="min-w-0 flex-1 rounded border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2 py-1 text-sm font-semibold text-[var(--tenant-surface-foreground)] outline-none" /> : <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{column.name}</button>}
          <span className="rounded-full bg-[var(--tenant-surface)] px-2 py-0.5 font-mono text-xs">{clients.length}</span>
        </div>
        <div className="flex items-center justify-between">
          <div>{editing ? <><Button size="sm" className="mr-1 h-7 px-2" onClick={onSave}><Check className="h-3.5 w-3.5" /></Button><Button size="sm" variant="outline" className="h-7 px-2" onClick={onCancel}><X className="h-3.5 w-3.5" /></Button></> : <p className="text-xs text-[var(--color-muted-foreground)]">Arraste clientes para esta coluna</p>}</div>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[var(--tenant-wine)]" onClick={() => onDelete(clients.length)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </header>
      <div ref={dropRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        <SortableContext items={clients.map((client) => client.id)} strategy={verticalListSortingStrategy}>
          {clients.map((client) => <SortableClient key={client.id} client={client} />)}
        </SortableContext>
        {clients.length === 0 ? <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">Arraste clientes para esta coluna</div> : null}
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
  column: ClientColumn & { clientCount: number };
  columns: ClientColumn[];
  onCancel: () => void;
  onConfirm: (targetColumnId: string | null) => void;
}) {
  const targets = columns.filter((item) => item.id !== column.id);
  const hasClients = column.clientCount > 0;
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
            {hasClients
              ? "Os clientes desta coluna precisam ser movidos para outra coluna antes da exclusão."
              : "Tem certeza que deseja excluir esta coluna vazia?"}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {hasClients && (
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
            onClick={() => onConfirm(hasClients ? targetColumnId : null)}
            disabled={hasClients && !targetColumnId}
          >
            {hasClients ? "Mover e excluir" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ClientesView({ tenantId, columns, clients, scope, userId }: { tenantId: string | null; columns: ClientColumn[]; clients: ClientItem[]; scope?: string; userId?: string }) {
  const [view, setView] = useState<"kanban" | "lista">("lista");
  const [localColumns, setColumns] = useState(columns);
  const [localClients, setClients] = useState(clients);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [active, setActive] = useState<ClientItem | null>(null);
  const [deleting, setDeleting] = useState<(ClientColumn & { clientCount: number }) | null>(null);
  const [creatingNewColumn, setCreatingNewColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [document, setDocument] = useState("");
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? localClients.filter((client) => `${client.name} ${client.email ?? ""} ${client.phone ?? ""} ${client.document ?? ""}`.toLowerCase().includes(term)) : localClients;
  }, [localClients, query]);

  const grouped = useMemo(() => localColumns.map((column) => ({ ...column, clients: filtered.filter((client) => client.kanban_column_id === column.id) })), [localColumns, filtered]);

  function dragEnd(event: DragEndEvent) {
    setActive(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const type = active.data.current?.type, overType = over.data.current?.type;
    if (type === "column" && overType === "column") {
      const oldIndex = localColumns.findIndex((x) => x.id === active.id), newIndex = localColumns.findIndex((x) => x.id === over.id);
      const ordered = arrayMove(localColumns, oldIndex, newIndex).map((x, position) => ({ ...x, position }));
      setColumns(ordered);
      startTransition(() => reorderClientColumns(ordered.map((x) => x.id)));
    }
    if (type === "client") {
      const target = overType === "client" ? String(over.data.current?.columnId) : String(over.id);
      const client = localClients.find((x) => x.id === active.id);
      if (!client || client.kanban_column_id === target || !localColumns.some((x) => x.id === target)) return;
      setClients((items) => items.map((x) => x.id === client.id ? { ...x, kanban_column_id: target } : x));
      startTransition(() => moveClient(client.id, target));
    }
  }

  function handleDeleteColumn(column: ClientColumn, clientCount: number) {
    if (clientCount === 0) {
      setColumns((current) => current.filter((x) => x.id !== column.id));
      startTransition(async () => {
        await deleteClientColumn(column.id, column.id);
      });
    } else {
      setDeleting({ ...column, clientCount });
    }
  }

  function handleConfirmDelete(column: ClientColumn & { clientCount: number }, targetColumnId: string | null) {
    if (targetColumnId) {
      setClients((current) => current.map((x) => x.kanban_column_id === column.id ? { ...x, kanban_column_id: targetColumnId } : x));
    }
    setColumns((current) => current.filter((x) => x.id !== column.id));
    setDeleting(null);
    startTransition(async () => {
      await deleteClientColumn(column.id, targetColumnId ?? column.id);
    });
  }

  function addNewColumn() {
    const cleanName = newColumnName.trim();
    if (!tenantId || !cleanName) return;
    startTransition(async () => {
      const column = await createClientColumn(tenantId, cleanName);
      setColumns((current) => [...current, column as ClientColumn]);
      setCreatingNewColumn(false);
      setNewColumnName("");
    });
  }

  function addClient() {
    if (!tenantId || !localColumns[0] || !name.trim()) return;
    const columnId = localColumns[0].id;
    startTransition(async () => {
      const client = await createClient(tenantId, columnId, name, email, phone, document);
      setClients((items) => [client as ClientItem, ...items]);
      setCreating(false);
      setName("");
      setEmail("");
      setPhone("");
      setDocument("");
    });
  }

  function closeCreateModal() {
    if (pending) return;
    setCreating(false);
    setName("");
    setEmail("");
    setPhone("");
    setDocument("");
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Clientes</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">Cadastro e relacionamento com cada cliente, organizados em um funil próprio do escritório.</p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">{localClients.length} cliente{localClients.length === 1 ? "" : "s"}</Badge>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {[{ label: "Clientes cadastrados", value: localClients.length, icon: Users }, { label: "Em atendimento", value: grouped.find((x) => /atendimento/i.test(x.name))?.clients.length ?? 0, icon: Phone }, { label: "Novos contatos", value: grouped.find((x) => /novo/i.test(x.name))?.clients.length ?? 0, icon: Plus, action: true }].map((metric) => (
          <Card key={metric.label} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
            <CardContent className="flex items-center justify-between p-4">
              <div><p className="text-sm text-[var(--color-muted-foreground)]">{metric.label}</p><p className="mt-1 text-3xl font-semibold">{metric.value}</p></div>
              {metric.action ? (
                <Button
                  type="button"
                  size="icon"
                  disabled={!tenantId || !localColumns[0] || pending}
                  aria-label="Adicionar cliente"
                  title="Adicionar cliente"
                  onClick={() => setCreating(true)}
                  className="h-10 w-10 rounded-full"
                >
                  <metric.icon className="h-5 w-5" />
                </Button>
              ) : (
                <metric.icon className="h-6 w-6 text-primary" />
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-1">
              {[["lista", ListFilter, "Lista"], ["kanban", KanbanSquare, "Quadro"]].map(([value, Icon, label]) => (
                <button key={value as string} type="button" onClick={() => setView(value as "kanban" | "lista")} className={cn("inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors", view === value ? "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm" : "text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]")}>
                  <Icon className="h-4 w-4" />{label as string}
                </button>
              ))}
            </div>
            <div className="flex min-w-[260px] flex-1 flex-wrap items-center justify-end gap-2">
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="Filtrar por nome, email ou telefone"
                onServerSearch={globalSearch}
                className="flex-1 md:max-w-md"
              />
            </div>
          </div>

          {view === "kanban" ? (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={(event) => { if (event.active.data.current?.type === "client") setActive(localClients.find((x) => x.id === event.active.id) ?? null); }} onDragEnd={dragEnd}>
              <div className="overflow-x-auto pb-2">
                <SortableContext items={localColumns.map((x) => x.id)} strategy={horizontalListSortingStrategy}>
                  <div className="flex min-h-[500px] gap-4 rounded-md">
                    {grouped.map((column) => (
                      <ClientColumnCard key={column.id} column={column} clients={column.clients} editing={editingId === column.id} draft={draft} onEdit={() => { setEditingId(column.id); setDraft(column.name); }} onDraft={setDraft} onSave={() => { const clean = draft.trim(); if (!clean) return; setColumns((current) => current.map((x) => x.id === column.id ? { ...x, name: clean } : x)); setEditingId(null); startTransition(() => renameClientColumn(column.id, clean)); }} onCancel={() => setEditingId(null)} onDelete={(clientCount) => handleDeleteColumn(column, clientCount)} />
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
                            <Button type="button" size="sm" disabled={!newColumnName.trim() || pending} onClick={addNewColumn}>Criar coluna</Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => { setCreatingNewColumn(false); setNewColumnName(""); }}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={!tenantId || pending}
                          onClick={() => { setNewColumnName(""); setCreatingNewColumn(true); }}
                          className="flex h-[min(68vh,720px)] min-h-[460px] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] text-[var(--color-muted-foreground)] transition-colors hover:border-[var(--tenant-brass)] hover:text-[var(--tenant-brass)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Plus className="h-7 w-7" />
                          <span className="text-sm font-medium">Adicionar coluna</span>
                          <span className="text-xs">Organize o relacionamento</span>
                        </button>
                      )}
                    </div>
                  </div>
                </SortableContext>
              </div>
              <DragOverlay>{active ? <div className="w-[300px] rotate-1 shadow-xl"><ClientCard client={active} /></div> : null}</DragOverlay>
            </DndContext>
          ) : (
            <div className="space-y-3">
              {filtered.length === 0 ? <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-sm text-[var(--color-muted-foreground)]">Nenhum cliente encontrado.</div> : filtered.map((client) => <ClientCard key={client.id} client={client} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {deleting ? <DeleteColumnDialog column={deleting} columns={localColumns} onCancel={() => setDeleting(null)} onConfirm={(targetColumnId) => handleConfirmDelete(deleting, targetColumnId)} /> : null}

      <Dialog open={creating} onOpenChange={(open) => open ? setCreating(true) : closeCreateModal()}>
        <DialogContent className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-[var(--color-card-foreground)]">Adicionar cliente</DialogTitle>
            <DialogDescription className="text-[var(--color-muted-foreground)]">
              O novo cadastro entra automaticamente em {localColumns[0]?.name ? `"${localColumns[0].name}"` : "primeira coluna"}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") addClient(); }}
                placeholder="Nome do cliente"
                className="bg-[var(--tenant-surface-muted)]"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="cliente@email.com"
                  className="bg-[var(--tenant-surface-muted)]"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(00) 00000-0000"
                  className="bg-[var(--tenant-surface-muted)]"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>CPF/CNPJ</Label>
              <Input
                value={document}
                onChange={(event) => setDocument(event.target.value)}
                placeholder="Opcional"
                className="bg-[var(--tenant-surface-muted)]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeCreateModal} disabled={pending}>
              Cancelar
            </Button>
            <Button type="button" onClick={addClient} disabled={!tenantId || !localColumns[0] || !name.trim() || pending}>
              {pending ? "Criando..." : "Criar cliente"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
