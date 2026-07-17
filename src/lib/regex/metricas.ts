// Registro de validações (IA ou humana) e atualização de métricas de regex.
// Ver docs/roadmap/08-ia-regex.md seções 5.4 (rastreamento por tribunal) e
// 8.1 (origem humana).

import type { SupabaseClient } from "@supabase/supabase-js";

export interface RegistrarValidacaoParams {
  regexId: string;
  tenantId: string | null;
  tribunalOrigem: string;
  texto: string;
  matchRegex: string | null;
  matchCorrigido: string | null;
  correto: boolean;
  origemValidacao: "ia" | "humano";
  tokensUsados?: number;
  custoUsd?: number;
}

/**
 * Registra o resultado de uma validação e atualiza os contadores agregados
 * da regex correspondente, disparando a checagem de transição de estado
 * (função SQL `check_regex_transition`, que também cuida do rollback e da
 * promoção automática pra global).
 */
export async function registrarValidacao(
  supabase: SupabaseClient,
  params: RegistrarValidacaoParams,
): Promise<void> {
  await supabase.from("regex_historico_validacoes").insert({
    regex_id: params.regexId,
    tenant_id: params.tenantId,
    tribunal_origem: params.tribunalOrigem,
    texto: params.texto,
    match_regex: params.matchRegex,
    match_corrigido: params.matchCorrigido,
    correto: params.correto,
    origem_validacao: params.origemValidacao,
    tokens_usados: params.tokensUsados,
    custo_usd: params.custoUsd,
  });

  await supabase.rpc("atualizar_metricas_regex", {
    p_regex_id: params.regexId,
    p_acerto: params.correto ? 1 : 0,
  });

  await supabase.rpc("check_regex_transition", { p_regex_id: params.regexId });
}
