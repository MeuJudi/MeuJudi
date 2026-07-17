"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  FileText,
  History,
  Link2,
  Mail,
  Phone,
  Plus,
  Trash2,
  User,
  Workflow,
} from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { ClienteDetail as ClienteDetailType } from "../actions";
import {
  addHistorico,
  deleteClient,
  linkProcesso,
  unlinkProcesso,
  updateClient,
} from "../actions";

const statusColors: Record<string, string> = {
  lead: "bg-gray-100 text-gray-700",
  contato: "bg-blue-100 text-blue-700",
  reuniao_agendada: "bg-amber-100 text-amber-700",
  proposta: "bg-purple-100 text-purple-700",
  fechado: "bg-green-100 text-green-700",
  perdido: "bg-red-100 text-red-700",
};

const statusLabels: Record<string, string> = {
  lead: "Lead",
  contato: "Em contato",
  reuniao_agendada: "Reunião agendada",
  proposta: "Proposta",
  fechado: "Fechado",
  perdido: "Perdido",
};

const historicoIcons: Record<string, string> = {
  ligacao: "📞",
  email: "📧",
  reuniao: "🤝",
  nota: "📝",
  whatsapp: "💬",
  outro: "📌",
};

function formatCnj(cnj: string) {
  return cnj.length === 20
    ? `${cnj.slice(0, 7)}-${cnj.slice(7, 9)}.${cnj.slice(9, 13)}.${cnj.slice(13, 14)}.${cnj.slice(14, 16)}.${cnj.slice(16)}`
    : cnj;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type Props = {
  cliente: ClienteDetailType;
};

export function ClienteDetail({ cliente }: Props) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [showAddHistorico, setShowAddHistorico] = useState(false);
  const [showLinkProcesso, setShowLinkProcesso] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [form, setForm] = useState({
    name: cliente.name,
    email: cliente.email ?? "",
    phone: cliente.phone ?? "",
    document: cliente.document ?? "",
    notes: cliente.notes ?? "",
    status: cliente.status ?? "lead",
    source: cliente.source ?? "",
    valor_estimado: cliente.valor_estimado?.toString() ?? "",
  });

  const [historicoForm, setHistoricoForm] = useState({
    tipo: "nota",
    titulo: "",
    descricao: "",
  });

  const [processoCnj, setProcessoCnj] = useState("");
  const [processoVinculo, setProcessoVinculo] = useState("autor");

  function handleSave() {
    startTransition(async () => {
      await updateClient(cliente.id, {
        name: form.name,
        email: form.email,
        phone: form.phone,
        document: form.document,
        notes: form.notes,
        status: form.status,
        source: form.source,
        valor_estimado: form.valor_estimado ? parseFloat(form.valor_estimado) : null,
      });
      setEditing(false);
    });
  }

  function handleAddHistorico() {
    if (!historicoForm.titulo.trim()) return;
    startTransition(async () => {
      await addHistorico(cliente.id, historicoForm.tipo, historicoForm.titulo, historicoForm.descricao);
      setHistoricoForm({ tipo: "nota", titulo: "", descricao: "" });
      setShowAddHistorico(false);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteClient(cliente.id);
      window.location.href = "/clientes";
    });
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/clientes"
            className="mt-1 rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--tenant-surface-foreground)]">
              {cliente.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {cliente.status && (
                <Badge className={cn("rounded-full", statusColors[cliente.status] ?? "bg-gray-100 text-gray-700")}>
                  {statusLabels[cliente.status] ?? cliente.status}
                </Badge>
              )}
              {cliente.document && (
                <Badge variant="outline" className="border-[var(--tenant-line)]">
                  {cliente.document}
                </Badge>
              )}
              {cliente.valor_estimado && (
                <Badge variant="outline" className="border-[var(--tenant-line)]">
                  {formatCurrency(cliente.valor_estimado)}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing(!editing)}
            className="border-[var(--tenant-line)]"
          >
            {editing ? "Cancelar" : "Editar"}
          </Button>
          {editing && (
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              {isPending ? "Salvando..." : "Salvar"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isPending}
            className="border-[var(--tenant-line)] text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <Tabs defaultValue="dados" className="space-y-4">
        <TabsList>
          <TabsTrigger value="dados" className="gap-2">
            <User className="h-4 w-4" /> Dados
          </TabsTrigger>
          <TabsTrigger value="processos" className="gap-2">
            <Workflow className="h-4 w-4" /> Processos ({cliente.processos.length})
          </TabsTrigger>
          <TabsTrigger value="historico" className="gap-2">
            <History className="h-4 w-4" /> Histórico ({cliente.historico.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dados">
          <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
            <CardContent className="p-5">
              {editing ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF/CNPJ</Label>
                    <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>E-mail</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value })}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="lead">Lead</option>
                      <option value="contato">Em contato</option>
                      <option value="reuniao_agendada">Reunião agendada</option>
                      <option value="proposta">Proposta</option>
                      <option value="fechado">Fechado</option>
                      <option value="perdido">Perdido</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Origem</Label>
                    <Input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Ex: indicação, Instagram, PJe" />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor estimado (R$)</Label>
                    <Input type="number" step="0.01" value={form.valor_estimado} onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })} />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Notas</Label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={3}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <InfoRow icon={<User className="h-4 w-4" />} label="Nome" value={cliente.name} />
                  <InfoRow icon={<FileText className="h-4 w-4" />} label="CPF/CNPJ" value={cliente.document} />
                  <InfoRow icon={<Mail className="h-4 w-4" />} label="E-mail" value={cliente.email} />
                  <InfoRow icon={<Phone className="h-4 w-4" />} label="Telefone" value={cliente.phone} />
                  <InfoRow icon={<Calendar className="h-4 w-4" />} label="Criado em" value={formatDate(cliente.created_at)} />
                  <InfoRow icon={<Workflow className="h-4 w-4" />} label="Origem" value={cliente.source} />
                  {cliente.valor_estimado && (
                    <InfoRow icon={<FileText className="h-4 w-4" />} label="Valor estimado" value={formatCurrency(cliente.valor_estimado)} />
                  )}
                  {cliente.notes && (
                    <div className="md:col-span-2">
                      <p className="text-xs text-[var(--color-muted-foreground)]">Notas</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{cliente.notes}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processos">
          <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Processos vinculados</h3>
                <Button size="sm" variant="outline" onClick={() => setShowLinkProcesso(!showLinkProcesso)} className="border-[var(--tenant-line)]">
                  <Link2 className="h-4 w-4 mr-1" /> Vincular processo
                </Button>
              </div>

              {showLinkProcesso && (
                <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                  <div className="space-y-1">
                    <Label className="text-xs">CNJ do processo</Label>
                    <Input
                      value={processoCnj}
                      onChange={(e) => setProcessoCnj(e.target.value)}
                      placeholder="00000000000000000000"
                      className="h-8 w-56 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Vínculo</Label>
                    <select
                      value={processoVinculo}
                      onChange={(e) => setProcessoVinculo(e.target.value)}
                      className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="autor">Autor</option>
                      <option value="reu">Réu</option>
                      <option value="representante">Representante</option>
                      <option value="terceiro">Terceiro</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!processoCnj.trim() || isPending}
                    onClick={() => {
                      startTransition(async () => {
                        await linkProcesso(cliente.id, processoCnj.trim(), processoVinculo);
                        setProcessoCnj("");
                        setShowLinkProcesso(false);
                      });
                    }}
                  >
                    Vincular
                  </Button>
                </div>
              )}

              {cliente.processos.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-5 text-sm text-[var(--color-muted-foreground)]">
                  Nenhum processo vinculado a este cliente.
                </div>
              ) : (
                <div className="space-y-2">
                  {cliente.processos.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{formatCnj(p.cnj)}</p>
                        <p className="text-xs text-[var(--color-muted-foreground)]">
                          {p.classe_nome} — {p.autor} x {p.reu}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs border-[var(--tenant-line)]">
                          {p.vinculo}
                        </Badge>
                        {p.auto_vinculado && (
                          <Badge className="text-xs bg-blue-100 text-blue-700">auto</Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            startTransition(async () => {
                              await unlinkProcesso(cliente.id, p.id);
                            });
                          }}
                          className="rounded p-1 text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
            <CardContent className="p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="font-semibold">Histórico de contatos</h3>
                <Button size="sm" variant="outline" onClick={() => setShowAddHistorico(!showAddHistorico)} className="border-[var(--tenant-line)]">
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>

              {showAddHistorico && (
                <div className="mb-4 rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 space-y-3">
                  <div className="flex flex-wrap gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Tipo</Label>
                      <select
                        value={historicoForm.tipo}
                        onChange={(e) => setHistoricoForm({ ...historicoForm, tipo: e.target.value })}
                        className="flex h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value="nota">Nota</option>
                        <option value="ligacao">Ligação</option>
                        <option value="email">E-mail</option>
                        <option value="reuniao">Reunião</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="outro">Outro</option>
                      </select>
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Título</Label>
                      <Input
                        value={historicoForm.titulo}
                        onChange={(e) => setHistoricoForm({ ...historicoForm, titulo: e.target.value })}
                        placeholder="Ex: Ligação de follow-up"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Descrição (opcional)</Label>
                    <textarea
                      value={historicoForm.descricao}
                      onChange={(e) => setHistoricoForm({ ...historicoForm, descricao: e.target.value })}
                      rows={2}
                      className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
                      placeholder="Detalhes do contato..."
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!historicoForm.titulo.trim() || isPending}
                    onClick={handleAddHistorico}
                  >
                    Salvar registro
                  </Button>
                </div>
              )}

              {cliente.historico.length === 0 ? (
                <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-5 text-sm text-[var(--color-muted-foreground)]">
                  Nenhum registro de contato ainda.
                </div>
              ) : (
                <div className="space-y-3">
                  {cliente.historico.map((h) => (
                    <div key={h.id} className="flex gap-3 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                      <span className="text-lg">{historicoIcons[h.tipo] ?? "📌"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold">{h.titulo}</p>
                          <span className="text-xs text-[var(--color-muted-foreground)]">{formatDate(h.created_at)}</span>
                        </div>
                        {h.descricao && (
                          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{h.descricao}</p>
                        )}
                        {h.user_name && (
                          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">por {h.user_name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[var(--tenant-wine)]" />
              Excluir cliente
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--color-muted-foreground)]">
              Tem certeza que deseja excluir este cliente? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
        {icon} {label}
      </p>
      <p className="mt-1 text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
