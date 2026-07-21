"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser, requireOwner } from "@/lib/auth/guards";
import { assertTenantWritable } from "@/lib/auth/access";
import { HONORARIOS_SEED } from "@/lib/honorarios-seed";

type Unidade = "hora" | "servico" | "mes" | "consulta" | "percentual" | "fixo";

export async function seedHonorariosSugeridos() {
  await assertTenantWritable();
  const { supabase, profile } = await requireOwner();

  if (profile.role !== "owner" && profile.role !== "super_admin") {
    throw new Error("Apenas o owner pode popular a tabela de honorários.");
  }

  // Verifica se já existe seed (idempotente)
  const { count } = await supabase
    .from("honorarios_sugeridos")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id);

  if (count && count > 0) {
    return { success: true, message: "Tabela já está populada.", total: count };
  }

  const rows = HONORARIOS_SEED.map((h) => ({
    tenant_id: profile.tenant_id,
    categoria: h.categoria,
    servico: h.servico,
    descricao: h.descricao,
    unidade: h.unidade as Unidade,
    valor_sugerido_oab: h.valor_sugerido_oab,
    valor_minimo: h.valor_minimo ?? null,
    valor_maximo: h.valor_maximo ?? null,
    base_legal: h.base_legal ?? null,
    valor_escritorio: h.valor_sugerido_oab, // default = sugestão OAB
    customizado: false,
    ativo: true,
  }));

  const { error } = await supabase.from("honorarios_sugeridos").insert(rows);
  if (error) throw error;

  revalidatePath("/configuracoes/honorarios");
  return { success: true, total: rows.length };
}

export async function atualizarValorEscritorio(
  honorarioId: string,
  valor: number | null
) {
  await assertTenantWritable();
  const { supabase, profile } = await requireOwner();

  const { error } = await supabase
    .from("honorarios_sugeridos")
    .update({
      valor_escritorio: valor,
      customizado: valor !== null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", honorarioId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/honorarios");
  return { success: true };
}

export async function toggleHonorarioAtivo(honorarioId: string, ativo: boolean) {
  await assertTenantWritable();
  const { supabase, profile } = await requireOwner();

  const { error } = await supabase
    .from("honorarios_sugeridos")
    .update({ ativo, updated_at: new Date().toISOString() })
    .eq("id", honorarioId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/honorarios");
  return { success: true };
}

export async function restaurarValorSugerido(honorarioId: string) {
  await assertTenantWritable();
  const { supabase, profile } = await requireOwner();

  const { data: h } = await supabase
    .from("honorarios_sugeridos")
    .select("valor_sugerido_oab")
    .eq("id", honorarioId)
    .eq("tenant_id", profile.tenant_id)
    .single();

  if (!h) throw new Error("Honorário não encontrado.");

  const { error } = await supabase
    .from("honorarios_sugeridos")
    .update({
      valor_escritorio: h.valor_sugerido_oab,
      customizado: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", honorarioId)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw error;

  revalidatePath("/configuracoes/honorarios");
  return { success: true };
}

export async function resetarTabelaHonorarios() {
  await assertTenantWritable();
  const { supabase, profile } = await requireOwner();

  if (profile.role !== "owner" && profile.role !== "super_admin") {
    throw new Error("Apenas o owner pode resetar a tabela de honorários.");
  }

  await supabase
    .from("honorarios_sugeridos")
    .delete()
    .eq("tenant_id", profile.tenant_id);

  return seedHonorariosSugeridos();
}

export async function adicionarHonorarioCustom(formData: FormData) {
  await assertTenantWritable();
  const { supabase, profile } = await requireOwner();

  const categoria = String(formData.get("categoria") ?? "").trim();
  const servico = String(formData.get("servico") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim() || null;
  const unidade = String(formData.get("unidade") ?? "servico") as Unidade;
  const valor = Number(formData.get("valor_escritorio") ?? 0);

  if (!categoria || !servico) {
    throw new Error("Categoria e serviço são obrigatórios.");
  }

  const { error } = await supabase.from("honorarios_sugeridos").insert({
    tenant_id: profile.tenant_id,
    categoria,
    servico,
    descricao,
    unidade,
    valor_sugerido_oab: valor, // custom = usa o valor do escritório como referência
    valor_escritorio: valor,
    customizado: true,
    ativo: true,
  });

  if (error) throw error;

  revalidatePath("/configuracoes/honorarios");
  return { success: true };
}
