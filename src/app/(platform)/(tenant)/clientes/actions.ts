"use server";

import { revalidatePath } from "next/cache";
import { requireWritableTenantDataAccess as requireAppUser } from "@/lib/auth/tenant-access";

const colors = ["#9a6a22", "#2563eb", "#7c3aed", "#0e7490", "#7a2e2e", "#4b6b4e"];

async function clientColumn(columnId: string) {
  const { supabase } = await requireAppUser();
  const { data, error } = await supabase.from("client_kanban_columns").select("id, tenant_id").eq("id", columnId).single();
  if (error || !data) throw new Error("Coluna não encontrada.");
  return { supabase, column: data as { id: string; tenant_id: string } };
}

export async function createClientColumn(tenantId: string, name = "Nova coluna") {
  const { supabase, profile } = await requireAppUser();
  if (profile.tenant_id !== tenantId && profile.role !== "super_admin") throw new Error("Sem acesso ao escritório.");
  const { data: rows } = await supabase.from("client_kanban_columns").select("position").eq("tenant_id", tenantId).order("position", { ascending: false }).limit(1);
  const position = ((rows?.[0]?.position as number | undefined) ?? -1) + 1;
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 60) throw new Error("Nome de coluna inválido.");
  const { data, error } = await supabase.from("client_kanban_columns").insert({ tenant_id: tenantId, name: cleanName, position, color: colors[position % colors.length], created_by: profile.id }).select("id, name, position, color, is_default").single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar a coluna.");
  revalidatePath("/clientes");
  return data;
}

export async function renameClientColumn(columnId: string, name: string) {
  const clean = name.trim();
  if (!clean || clean.length > 60) throw new Error("Nome de coluna inválido.");
  const { supabase } = await clientColumn(columnId);
  const { error } = await supabase.from("client_kanban_columns").update({ name: clean }).eq("id", columnId);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}

export async function reorderClientColumns(ids: string[]) {
  for (const [position, id] of Array.from(new Set(ids)).entries()) {
    const { supabase } = await clientColumn(id);
    const { error } = await supabase.from("client_kanban_columns").update({ position }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/clientes");
}

export async function moveClient(clientId: string, columnId: string) {
  const { supabase, column } = await clientColumn(columnId);
  const { error } = await supabase.from("clientes").update({ kanban_column_id: column.id }).eq("id", clientId).eq("tenant_id", column.tenant_id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}

export async function deleteClientColumn(columnId: string, targetColumnId: string) {
  if (columnId === targetColumnId) throw new Error("Escolha outra coluna destino.");
  const { supabase, column: source } = await clientColumn(columnId);
  const { column: target } = await clientColumn(targetColumnId);
  if (source.tenant_id !== target.tenant_id) throw new Error("As colunas devem ser do mesmo escritório.");
  const { error: moveError } = await supabase.from("clientes").update({ kanban_column_id: target.id }).eq("tenant_id", source.tenant_id).eq("kanban_column_id", source.id);
  if (moveError) throw new Error(moveError.message);
  const { error } = await supabase.from("client_kanban_columns").update({ is_active: false }).eq("id", source.id);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}

export async function createClient(tenantId: string, columnId: string, name: string, email: string, phone: string, document?: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe o nome do cliente.");
  const { supabase, profile } = await requireAppUser();
  if (profile.tenant_id !== tenantId && profile.role !== "super_admin") throw new Error("Sem acesso ao escritório.");
  const { data, error } = await supabase.from("clientes").insert({
    tenant_id: tenantId,
    kanban_column_id: columnId,
    name: cleanName,
    email: email.trim() || null,
    phone: phone.trim() || null,
    document: document?.trim() || null,
    status: "lead",
    source: "manual",
    created_by: profile.id,
  }).select("id, name, document, email, phone, notes, kanban_column_id, status, source, tags, created_at, created_by").single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar o cliente.");
  revalidatePath("/clientes");
  return data;
}

/* ─── Client Detail ─── */

export type ClienteDetail = {
  id: string;
  name: string;
  document: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: string | null;
  source: string | null;
  valor_estimado: number | null;
  tags: string[] | null;
  kanban_column_id: string | null;
  created_at: string;
  updated_at: string;
  processos: { id: string; cnj: string; classe_nome: string | null; autor: string | null; reu: string | null; status: string; vinculo: string; auto_vinculado: boolean }[];
  historico: { id: string; tipo: string; titulo: string; descricao: string | null; user_name: string | null; created_at: string }[];
};

export async function getClientById(clientId: string) {
  const { supabase, profile } = await requireAppUser();

  const { data: cliente, error } = await supabase
    .from("clientes")
    .select("id, name, document, email, phone, notes, status, source, valor_estimado, tags, kanban_column_id, created_at, updated_at")
    .eq("id", clientId)
    .single();

  if (error || !cliente) throw new Error("Cliente não encontrado.");

  if (profile.role !== "super_admin" && cliente.kanban_column_id) {
    const { data: col } = await supabase
      .from("client_kanban_columns")
      .select("tenant_id")
      .eq("id", cliente.kanban_column_id)
      .single();
    if (col && col.tenant_id !== profile.tenant_id) throw new Error("Sem acesso a este cliente.");
  }

  const { data: vinculos } = await supabase
    .from("cliente_processos")
    .select("processo_id, vinculo, auto_vinculado")
    .eq("cliente_id", clientId);

  const processoIds = (vinculos ?? []).map((v) => v.processo_id);
  const { data: processos } = processoIds.length
    ? await supabase.from("processos").select("id, cnj, classe_nome, autor, reu, status").in("id", processoIds)
    : { data: [] };

  const vinculoByProcessoId = new Map((vinculos ?? []).map((v) => [v.processo_id, { vinculo: v.vinculo, auto_vinculado: v.auto_vinculado }]));

  const { data: historicoRows } = await supabase
    .from("cliente_historico")
    .select("id, tipo, titulo, descricao, user_id, created_at")
    .eq("cliente_id", clientId)
    .order("created_at", { ascending: false })
    .limit(50);

  const userIds = [...new Set((historicoRows ?? []).map((h) => h.user_id).filter(Boolean))];
  const { data: userRows } = userIds.length
    ? await supabase.from("users").select("id, name").in("id", userIds)
    : { data: [] };
  const userByName = new Map((userRows ?? []).map((u) => [u.id, u.name]));

  const processosLinked = (processos ?? []).map((p) => ({
    id: p.id,
    cnj: p.cnj,
    classe_nome: p.classe_nome,
    autor: p.autor,
    reu: p.reu,
    status: p.status,
    vinculo: vinculoByProcessoId.get(p.id)?.vinculo ?? "autor",
    auto_vinculado: vinculoByProcessoId.get(p.id)?.auto_vinculado ?? false,
  }));

  const historico = (historicoRows ?? []).map((h) => ({
    id: h.id,
    tipo: h.tipo,
    titulo: h.titulo,
    descricao: h.descricao,
    user_name: h.user_id ? userByName.get(h.user_id) ?? null : null,
    created_at: h.created_at,
  }));

  return {
    ...cliente,
    processos: processosLinked,
    historico,
  } satisfies ClienteDetail;
}

/* ─── Update Client ─── */

export async function updateClient(clientId: string, data: { name?: string; email?: string; phone?: string; document?: string; notes?: string; status?: string; source?: string; valor_estimado?: number | null }) {
  const { supabase, profile } = await requireAppUser();
  const { data: existing } = await supabase.from("clientes").select("id, kanban_column_id").eq("id", clientId).single();
  if (!existing) throw new Error("Cliente não encontrado.");

  if (existing.kanban_column_id && profile.role !== "super_admin") {
    const { data: col } = await supabase.from("client_kanban_columns").select("tenant_id").eq("id", existing.kanban_column_id).single();
    if (col && col.tenant_id !== profile.tenant_id) throw new Error("Sem acesso a este cliente.");
  }

  const update: Record<string, unknown> = {};
  if (data.name !== undefined) update.name = data.name.trim();
  if (data.email !== undefined) update.email = data.email.trim() || null;
  if (data.phone !== undefined) update.phone = data.phone.trim() || null;
  if (data.document !== undefined) update.document = data.document.trim() || null;
  if (data.notes !== undefined) update.notes = data.notes.trim() || null;
  if (data.status !== undefined) update.status = data.status;
  if (data.source !== undefined) update.source = data.source;
  if (data.valor_estimado !== undefined) update.valor_estimado = data.valor_estimado;

  const { error } = await supabase.from("clientes").update(update).eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${clientId}`);
}

/* ─── Delete Client ─── */

export async function deleteClient(clientId: string) {
  const { supabase, profile } = await requireAppUser();
  const { data: existing } = await supabase.from("clientes").select("id, kanban_column_id").eq("id", clientId).single();
  if (!existing) throw new Error("Cliente não encontrado.");

  if (existing.kanban_column_id && profile.role !== "super_admin") {
    const { data: col } = await supabase.from("client_kanban_columns").select("tenant_id").eq("id", existing.kanban_column_id).single();
    if (col && col.tenant_id !== profile.tenant_id) throw new Error("Sem acesso a este cliente.");
  }

  const { error } = await supabase.from("clientes").delete().eq("id", clientId);
  if (error) throw new Error(error.message);
  revalidatePath("/clientes");
}

/* ─── History ─── */

export async function addHistorico(clientId: string, tipo: string, titulo: string, descricao?: string) {
  const cleanTitulo = titulo.trim();
  if (!cleanTitulo) throw new Error("Informe um título para o registro.");
  const { supabase, profile } = await requireAppUser();
  const { error } = await supabase.from("cliente_historico").insert({
    tenant_id: profile.tenant_id,
    cliente_id: clientId,
    user_id: profile.id,
    tipo,
    titulo: cleanTitulo,
    descricao: descricao?.trim() || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
}

/* ─── Process Linking ─── */

export async function linkProcesso(clientId: string, processoId: string, vinculo: string = "autor") {
  const { supabase, profile } = await requireAppUser();
  const { error } = await supabase.from("cliente_processos").insert({
    tenant_id: profile.tenant_id,
    cliente_id: clientId,
    processo_id: processoId,
    vinculo,
    auto_vinculado: false,
  }).select().single();
  if (error) {
    if (error.code === "23505") throw new Error("Este processo já está vinculado a este cliente.");
    throw new Error(error.message);
  }
  revalidatePath(`/clientes/${clientId}`);
}

export async function unlinkProcesso(clientId: string, processoId: string) {
  const { supabase } = await requireAppUser();
  const { error } = await supabase.from("cliente_processos").delete().eq("cliente_id", clientId).eq("processo_id", processoId);
  if (error) throw new Error(error.message);
  revalidatePath(`/clientes/${clientId}`);
}

/* ─── Auto-link by document ─── */

export async function autoLinkByDocument(tenantId: string) {
  const { supabase, profile } = await requireAppUser();
  if (profile.tenant_id !== tenantId && profile.role !== "super_admin") throw new Error("Sem acesso ao escritório.");

  const { data: clientes } = await supabase
    .from("clientes")
    .select("id, name, document")
    .eq("tenant_id", tenantId)
    .not("document", "is", null);

  if (!clientes?.length) return { linked: 0 };

  let linked = 0;
  for (const cliente of clientes) {
    const { data: processos } = await supabase
      .from("processos")
      .select("id")
      .eq("tenant_id", tenantId)
      .or(`autor.ilike.%${cliente.name}%,reu.ilike.%${cliente.name}%`);

    if (!processos?.length) continue;
    for (const processo of processos) {
      const { error } = await supabase.from("cliente_processos").upsert({
        tenant_id: tenantId,
        cliente_id: cliente.id,
        processo_id: processo.id,
        vinculo: "autor",
        auto_vinculado: true,
      }, { onConflict: "cliente_id,processo_id", ignoreDuplicates: true });
      if (!error) linked++;
    }
  }

  revalidatePath("/clientes");
  return { linked };
}
