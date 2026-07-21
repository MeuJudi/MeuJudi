// Camada 3 — IA Confirmadora (Haiku): confirma ou corrige o match de um
// regex quando a engine (Parte 3) sinaliza `confianca: "media"`.
// Ver docs/roadmap/08-ia-regex.md seção 6.1.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarIA } from "./client";
import { PROMPTS } from "./prompts";
import { extrairJSON } from "./json-utils";
import { registrarValidacao } from "@/lib/regex/metricas";
import type { CampoExtraido } from "./types";

export interface ResultadoConfirmacao {
  correto: boolean;
  valorCorreto: string | null;
  /** true quando a IA falhou (erro de rede/parse) — NUNCA tratar como "correto". */
  incerto: boolean;
  custoUsd: number;
}

/**
 * CORREÇÃO DE BUG CRÍTICO do desenho original: a v1 tinha um `catch` que
 * assumia `correto: true` quando a IA falhava (erro de rede, JSON mal
 * formado, timeout). Isso contamina a métrica de acerto do regex
 * silenciosamente. Aqui, erro de IA = incerto = NUNCA confirma automaticamente.
 */
export async function validarComIA(
  padrao: string,
  match: string,
  texto: string,
): Promise<ResultadoConfirmacao> {
  try {
    const { texto: resposta, custoUsd } = await chamarIA(
      "validar_regex",
      PROMPTS.validarRegex(padrao, match, texto),
      256,
    );

    const parsed = extrairJSON<{ correto?: boolean; valor_correto?: string | null }>(resposta);

    if (typeof parsed.correto !== "boolean") {
      // Resposta veio, mas não tem o shape esperado — trata como incerto,
      // nunca como "correto por padrão".
      return { correto: false, valorCorreto: null, incerto: true, custoUsd };
    }

    return {
      correto: parsed.correto,
      valorCorreto: parsed.valor_correto ?? null,
      incerto: false,
      custoUsd,
    };
  } catch {
    // Erro de rede, timeout, ou JSON.parse falhou: NUNCA assume correto.
    return { correto: false, valorCorreto: null, incerto: true, custoUsd: 0 };
  }
}

export interface ResultadoCamada3 {
  resolvido: boolean;
  valor: string | null;
  precisaCamada4: boolean;
  /** Custo real da chamada (0 se `incerto` — a chamada falhou antes de gastar). */
  custoUsd: number;
}

/**
 * Fluxo completo da Camada 3, já integrando o registro de métricas
 * (Parte 3 — `registrarValidacao`, que também dispara a checagem de
 * transição de estado da regex).
 */
export async function executarCamada3(
  supabase: SupabaseClient,
  params: {
    regexId: string;
    padrao: string;
    match: string;
    texto: string;
    tenantId: string;
    tribunalOrigem: string;
    campo: CampoExtraido;
  },
): Promise<ResultadoCamada3> {
  const validacao = await validarComIA(params.padrao, params.match, params.texto);

  if (validacao.incerto) {
    // Não registra acerto/erro do regex — foi a IA que falhou, não o regex.
    // Escala pra Camada 4 sem penalizar a métrica.
    return { resolvido: false, valor: null, precisaCamada4: true, custoUsd: validacao.custoUsd };
  }

  await registrarValidacao(supabase, {
    regexId: params.regexId,
    tenantId: params.tenantId,
    tribunalOrigem: params.tribunalOrigem,
    texto: params.texto,
    matchRegex: params.match,
    matchCorrigido: validacao.valorCorreto,
    correto: validacao.correto,
    origemValidacao: "ia",
    campo: params.campo,
    custoUsd: validacao.custoUsd,
  });

  if (validacao.correto) {
    return {
      resolvido: true,
      valor: validacao.valorCorreto ?? params.match,
      precisaCamada4: false,
      custoUsd: validacao.custoUsd,
    };
  }

  // IA discordou do regex com confiança: precisa de extração completa (Camada 4)
  return { resolvido: false, valor: null, precisaCamada4: true, custoUsd: validacao.custoUsd };
}
