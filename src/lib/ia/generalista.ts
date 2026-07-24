// Camada 4 — IA Generalista (Sonnet): extrai do zero quando nenhum regex
// bateu, ou quando a Camada 3 discordou do match.
// Ver docs/roadmap/08-ia-regex.md seção 6.2 (Sonnet, ~9% do volume).

import { chamarIA } from "./client";
import { PROMPTS, type ContextoProcesso } from "./prompts";
import { extrairJSON } from "./json-utils";
import type { NivelConfianca } from "./types";

export type { ContextoProcesso };

export interface ResultadoExtracaoCompleta {
  prazo_dias: number | null;
  prazo_horas: number | null;
  data_audiencia: string | null;
  fundamento_legal: string | null;
  confianca: NivelConfianca;
  custoUsd: number;
  /** true quando a IA falhou (erro de rede/parse) — nunca inventa dado. */
  incerto: boolean;
}

export async function extrairComIAGeneralista(
  texto: string,
  contexto: ContextoProcesso,
): Promise<ResultadoExtracaoCompleta> {
  // custoUsd fora do try: mesma correção da Camada 3 (confirmadora.ts) —
  // achado 07 da auditoria de 23/07/2026. Se `chamarIA` responder com
  // sucesso, o custo já foi cobrado pela Anthropic mesmo que o parsing
  // falhe depois.
  let custoUsd = 0;
  try {
    const resposta = await chamarIA(
      "extrair_prazo_complexo",
      PROMPTS.extrairPrazo(texto, contexto),
      2048,
    );
    custoUsd = resposta.custoUsd;

    const parsed = extrairJSON<{
      prazo_dias?: number | null;
      prazo_horas?: number | null;
      data_audiencia?: string | null;
      fundamento_legal?: string | null;
      confianca?: NivelConfianca;
    }>(resposta.texto);

    return {
      prazo_dias: parsed.prazo_dias ?? null,
      prazo_horas: parsed.prazo_horas ?? null,
      data_audiencia: parsed.data_audiencia ?? null,
      fundamento_legal: parsed.fundamento_legal ?? null,
      confianca: parsed.confianca ?? "baixa",
      custoUsd,
      incerto: false,
    };
  } catch {
    // Erro de rede (custoUsd continua 0) ou parsing depois de chamada
    // bem-sucedida (custoUsd já capturado acima) = confiança baixa, nunca
    // inventa dado. Isso deve ir pra Central de Revisão (Parte 7), não ser
    // descartado.
    return {
      prazo_dias: null,
      prazo_horas: null,
      data_audiencia: null,
      fundamento_legal: null,
      confianca: "baixa",
      custoUsd,
      incerto: true,
    };
  }
}
