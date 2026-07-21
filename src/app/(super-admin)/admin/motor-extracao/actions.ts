"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { validarSegurancaRegex } from "@/lib/regex/redos-guard";
import type { EstadoRegex } from "@/lib/ia/types";

async function logAcaoManual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- client já tipado pelo guard
  supabase: any,
  tipo: string,
  regexId: string | null,
  detalhes: Record<string, unknown>,
) {
  await supabase.from("motor_extracao_log").insert({
    tipo: "acao_manual_admin",
    regex_id: regexId,
    detalhes: { acao: tipo, ...detalhes },
  });
}

/** Editar uma regex manualmente — passa pelo mesmo guard de segurança que a IA (Parte 2). */
export async function editarRegexManualmente(regexId: string, novoPadrao: string, novasFlags: string) {
  const { supabase } = await requireSuperAdmin();

  const seguranca = await validarSegurancaRegex(novoPadrao, novasFlags || "i");
  if (!seguranca.seguro) {
    throw new Error(`Regex reprovada na validação de segurança: ${seguranca.motivo} — ${seguranca.detalhe ?? ""}`);
  }

  const { data: atual } = await supabase.from("regex_metadata").select("pattern").eq("id", regexId).single();

  await supabase
    .from("regex_metadata")
    .update({
      pattern: novoPadrao,
      flags: novasFlags || "i",
      regex_anterior: atual?.pattern,
      motivo_mudanca: "edicao_manual_admin",
    })
    .eq("id", regexId);

  await logAcaoManual(supabase, "editar_regex", regexId, { regex_anterior: atual?.pattern, regex_novo: novoPadrao });
  revalidatePath("/admin/motor-extracao");
}

/** Forçar mudança de estado sem esperar o ciclo automático. */
export async function forcarEstadoRegex(regexId: string, novoEstado: EstadoRegex) {
  const { supabase } = await requireSuperAdmin();
  await supabase.from("regex_metadata").update({ state: novoEstado }).eq("id", regexId);
  await logAcaoManual(supabase, "forcar_estado", regexId, { novo_estado: novoEstado });
  revalidatePath("/admin/motor-extracao");
}

/** Kill switch pontual — desativa imediatamente. */
export async function desativarRegexImediatamente(regexId: string, motivo: string) {
  const { supabase } = await requireSuperAdmin();
  await supabase.from("regex_metadata").update({ state: "desativada", motivo_mudanca: motivo }).eq("id", regexId);
  await logAcaoManual(supabase, "desativar_regex", regexId, { motivo });
  revalidatePath("/admin/motor-extracao");
}

/** Reverter uma promoção pra global (volta a ser específica de 1 tenant). */
export async function reverterPromocaoGlobal(regexId: string, tenantIdDestino: string) {
  const { supabase } = await requireSuperAdmin();
  await supabase.from("regex_metadata").update({ tenant_id: tenantIdDestino }).eq("id", regexId);
  await logAcaoManual(supabase, "reverter_promocao_global", regexId, { tenant_destino: tenantIdDestino });
  revalidatePath("/admin/motor-extracao");
}

/** Ajustar o teto de custo de um tenant específico. */
export async function ajustarTetoCustoTenant(tenantId: string, novoTetoUsd: number) {
  const { supabase } = await requireSuperAdmin();
  await supabase.from("tenants").update({ teto_custo_ia_diario_usd: novoTetoUsd }).eq("id", tenantId);
  await logAcaoManual(supabase, "ajustar_teto_custo", null, { tenant_id: tenantId, novo_teto_usd: novoTetoUsd });
  revalidatePath("/admin/motor-extracao");
}

/**
 * Reprocessa manualmente um item pendente da Central de Revisão (Parte 7) —
 * roda o pipeline completo de novo pra esse texto/processo, por exemplo
 * depois de corrigir/editar uma regex que devia ter resolvido o caso.
 */
export async function reprocessarItemRevisao(itemId: string) {
  const { supabase } = await requireSuperAdmin();

  const { data: item } = await supabase
    .from("itens_revisao")
    .select("*, processo:processos(tribunal, classe_nome)")
    .eq("id", itemId)
    .single();
  if (!item) throw new Error("Item de revisão não encontrado");

  const { extrairCampo } = await import("@/lib/extracao/pipeline");
  const resultado = await extrairCampo(supabase, {
    tenantId: item.tenant_id,
    processoId: item.processo_id,
    texto: item.texto_original,
    campo: item.campo,
    tribunal: item.tribunal_origem ?? item.processo?.tribunal ?? "desconhecido",
    contextoProcesso: {
      classe: item.processo?.classe_nome ?? "desconhecida",
      tribunal: item.tribunal_origem ?? "desconhecido",
      tipo: "intimacao",
    },
  });

  await logAcaoManual(supabase, "reprocessar_item_revisao", item.regex_id, {
    item_revisao_id: itemId,
    novo_resultado: resultado,
  });
  revalidatePath("/admin/motor-extracao");
  return resultado;
}
