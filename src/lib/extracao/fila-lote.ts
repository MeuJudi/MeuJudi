// Fila de processamento em lote (Parte 9): enfileira textos que não são
// urgentes pra processar via Batch API da Anthropic (~50% mais barato,
// até 24h de espera). Ver docs/roadmap/08-ia-regex.md seção 12.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoExtraido } from "@/lib/ia/types";
import { classificarUrgencia, type ContextoUrgencia, type ResultadoClassificacao } from "./classificador-urgencia";

export async function registrarClassificacaoUrgencia(
  supabase: SupabaseClient,
  tenantId: string,
  resultado: ResultadoClassificacao,
): Promise<void> {
  await supabase.from("classificacao_urgencia_log").insert({
    tenant_id: tenantId,
    classificacao: resultado.classificacao,
    motivo: resultado.motivo,
  });
}

/** Classifica e já registra o log — atalho usado pelo pipeline. */
export async function classificarERegistrar(
  supabase: SupabaseClient,
  tenantId: string,
  contexto: ContextoUrgencia,
): Promise<ResultadoClassificacao> {
  const resultado = classificarUrgencia(contexto);
  await registrarClassificacaoUrgencia(supabase, tenantId, resultado);
  return resultado;
}

export async function enfileirarParaLote(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    processoId: string;
    campo: CampoExtraido;
    texto: string;
    contexto: Record<string, unknown>;
  },
): Promise<void> {
  await supabase.from("fila_processamento_lote").insert({
    tenant_id: params.tenantId,
    processo_id: params.processoId,
    campo: params.campo,
    texto: params.texto,
    contexto: params.contexto,
    status: "pendente",
  });
}
