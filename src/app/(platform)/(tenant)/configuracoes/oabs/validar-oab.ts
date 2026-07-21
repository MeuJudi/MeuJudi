"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth/guards";
import { assertTenantWritable } from "@/lib/auth/access";
import { consultarOab, type OabAdvogado } from "@/lib/oab-service";

export type ValidarOabResultado =
  | { ok: true; dados: OabAdvogado | null; fonte: "oab" | "cache" }
  | { ok: false; erro: string };

/**
 * Valida uma OAB já cadastrada.
 * Nunca propaga exception para não quebrar o RSC quando a API da OAB
 * estiver fora do ar — devolve { ok: false, erro } para o client.
 */
export async function validarOabEscritorio(
  oabId: string
): Promise<ValidarOabResultado> {
  try {
    await assertTenantWritable();
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }

  let profile: Awaited<ReturnType<typeof requireAppUser>>["profile"];
  let supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"];
  try {
    const ctx = await requireAppUser();
    profile = ctx.profile;
    supabase = ctx.supabase;
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }

  let oab: { id: string; oab_number: string; oab_uf: string; tenant_id: string } | null = null;
  try {
    const { data, error } = await supabase
      .from("escritorio_oabs")
      .select("id, oab_number, oab_uf, tenant_id")
      .eq("id", oabId)
      .single();
    if (error || !data) {
      return { ok: false, erro: "OAB não encontrada no escritório." };
    }
    oab = data;
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : String(err) };
  }

  if (
    oab.tenant_id !== profile.tenant_id &&
    profile.role !== "super_admin"
  ) {
    return { ok: false, erro: "Sem acesso a esta OAB." };
  }

  let dados: OabAdvogado | null = null;
  try {
    dados = await consultarOab(oab.oab_number, oab.oab_uf);
  } catch (err) {
    // API da OAB fora do ar / timeout / 500 — devolve erro inline
    return {
      ok: false,
      erro:
        err instanceof Error
          ? err.message
          : "Não foi possível consultar a OAB agora.",
    };
  }

  // Persiste o cache (best-effort; falha aqui não bloqueia a UX)
  try {
    await supabase
      .from("escritorio_oabs")
      .update({
        validado_em: new Date().toISOString(),
        validado_nome: dados?.nome ?? null,
        validado_situacao: dados?.situacao ?? "NAO_ENCONTRADO",
        validado_tipo: dados?.tipo ?? null,
        validado_match: dados?.situacao
          ? /ATIV|REGULAR|REGULARMENTE|INSCRITO/i.test(dados.situacao)
          : false,
      })
      .eq("id", oabId);
  } catch {
    // ignora — cache é best-effort
  }

  revalidatePath("/configuracoes/oabs");
  revalidatePath("/configuracoes/escritorio");
  return { ok: true, dados, fonte: "oab" };
}
