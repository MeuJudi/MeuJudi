"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth/guards";

const colors = ["#9a6a22", "#2563eb", "#7c3aed", "#0e7490", "#7a2e2e", "#4b6b4e"];

async function clientColumn(columnId: string) {
  const { supabase } = await requireAppUser();
  const { data, error } = await supabase.from("client_kanban_columns").select("id, tenant_id").eq("id", columnId).single();
  if (error || !data) throw new Error("Coluna não encontrada.");
  return { supabase, column: data as { id: string; tenant_id: string } };
}

export async function createClientColumn(tenantId: string) {
  const { supabase, profile } = await requireAppUser();
  if (profile.tenant_id !== tenantId && profile.role !== "super_admin") throw new Error("Sem acesso ao escritório.");
  const { data: rows } = await supabase.from("client_kanban_columns").select("position").eq("tenant_id", tenantId).order("position", { ascending: false }).limit(1);
  const position = ((rows?.[0]?.position as number | undefined) ?? -1) + 1;
  const { data, error } = await supabase.from("client_kanban_columns").insert({ tenant_id: tenantId, name: "Nova coluna", position, color: colors[position % colors.length], created_by: profile.id }).select("id, name, position, color, is_default").single();
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

export async function createClient(tenantId: string, columnId: string, name: string, email: string, phone: string) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Informe o nome do cliente.");
  const { supabase, profile } = await requireAppUser();
  if (profile.tenant_id !== tenantId && profile.role !== "super_admin") throw new Error("Sem acesso ao escritório.");
  const { data, error } = await supabase.from("clientes").insert({ tenant_id: tenantId, kanban_column_id: columnId, name: cleanName, email: email.trim() || null, phone: phone.trim() || null, created_by: profile.id }).select("id, name, document, email, phone, notes, kanban_column_id, created_at").single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar o cliente.");
  revalidatePath("/clientes");
  return data;
}
