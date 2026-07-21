// Camada 5 — Auto-correção: Opus sugere um regex novo quando um padrão se
// repete sem que nenhum regex existente o capture. 3 travas antes de
// auto-aprovar (entra ativa em estado 'novo', com rollback automático se
// performar mal depois — ver check_regex_transition, Parte 3).
//
// Substitui a Edge Function do plano original (`supabase/functions/learn-regex`)
// — este projeto não usa Supabase Edge Functions, só Next.js. É uma função
// comum, chamável de um Server Action ou de uma rota de cron futura.
//
// Ver docs/roadmap/08-ia-regex.md seção 7 e 13.4.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chamarIA } from "./client";
import { PROMPTS } from "./prompts";
import { extrairJSON } from "./json-utils";
import { validarSegurancaRegex } from "@/lib/regex/redos-guard";
import { rodarGoldenDataset } from "@/lib/regex/golden-dataset";
import type { CampoExtraido } from "./types";

export type MotivoFalhaAprendizado =
  | "regex_reprovada_seguranca"
  | "regex_nao_casa"
  | "regex_invalida"
  | "falhou_golden_dataset";

export interface ResultadoAprenderRegex {
  sucesso: boolean;
  motivo?: MotivoFalhaAprendizado;
  detalhes?: unknown;
  regexId?: string;
  custoUsd: number;
}

export async function aprenderRegex(
  supabase: SupabaseClient,
  params: {
    texto: string;
    campo: CampoExtraido;
    camposExtraidos: Record<string, unknown>;
    tenantId: string;
    tribunalOrigem: string;
  },
): Promise<ResultadoAprenderRegex> {
  // Camada 5: Opus sugere regex nova (tarefa rara — vale pagar mais por qualidade)
  const { texto: respostaBruta, custoUsd } = await chamarIA(
    "sugerir_regex",
    PROMPTS.sugerirRegex(params.texto, params.camposExtraidos),
    256,
  );
  const regexSugerida = limparRespostaRegex(respostaBruta);

  // TRAVA 1: segurança contra ReDoS
  const seguranca = await validarSegurancaRegex(regexSugerida);
  if (!seguranca.seguro) {
    await logarErro(supabase, params, "regex_reprovada_seguranca", { regex: regexSugerida, detalhe: seguranca.detalhe });
    return { sucesso: false, motivo: "regex_reprovada_seguranca", detalhes: seguranca, custoUsd };
  }

  // TRAVA 2: regex precisa pelo menos casar com o texto que a originou
  let re: RegExp;
  try {
    re = new RegExp(regexSugerida, "i");
  } catch (err) {
    await logarErro(supabase, params, "regex_invalida", { regex: regexSugerida, erro: (err as Error).message });
    return { sucesso: false, motivo: "regex_invalida", custoUsd };
  }
  if (!re.test(params.texto)) {
    await logarErro(supabase, params, "regex_nao_casa", { regex: regexSugerida });
    return { sucesso: false, motivo: "regex_nao_casa", custoUsd };
  }

  // TRAVA 3: golden dataset — mesmo entrando como 'novo' (auto-aprovado), a
  // regex não pode falhar nos casos-armadilha já conhecidos
  const resultadoGolden = await rodarGoldenDataset(supabase, regexSugerida, "i", params.campo);
  if (!resultadoGolden.passou) {
    await logarErro(supabase, params, "falhou_golden_dataset", { regex: regexSugerida, casos_falhos: resultadoGolden.casosFalhos });
    return { sucesso: false, motivo: "falhou_golden_dataset", detalhes: resultadoGolden, custoUsd };
  }

  // Passou nas 3 travas: AUTO-APROVA (entra ativa em 'novo', com rollback
  // automático se performar mal depois)
  const { data, error } = await supabase
    .from("regex_metadata")
    .insert({
      tenant_id: params.tenantId,
      name: `auto_${Date.now()}`,
      description: "Sugerida automaticamente pela IA (Camada 5, Opus)",
      pattern: regexSugerida,
      flags: "i",
      state: "novo",
      campo: params.campo,
      created_by: "sistema",
      texto_exemplo: params.texto,
    })
    .select()
    .single();

  if (error || !data) {
    await logarErro(supabase, params, "regex_invalida", { regex: regexSugerida, erro_insert: error?.message });
    return { sucesso: false, motivo: "regex_invalida", custoUsd };
  }

  await supabase.from("motor_extracao_log").insert({
    tipo: "regex_criada",
    tenant_id: params.tenantId,
    tribunal_origem: params.tribunalOrigem,
    regex_id: data.id,
    detalhes: { regex: regexSugerida, texto_origem: params.texto, custo_geracao_usd: custoUsd },
  });

  return { sucesso: true, regexId: data.id, custoUsd };
}

/**
 * Mesmo pedindo explicitamente "só a regex, sem markdown", vale aplicar a
 * mesma robustez usada em `extrairJSON` — LLMs às vezes envolvem a resposta
 * em crases mesmo quando não é JSON.
 */
function limparRespostaRegex(resposta: string): string {
  const bloco = resposta.trim().match(/^`{1,3}(?:regex)?\s*([\s\S]*?)\s*`{1,3}$/);
  return (bloco ? bloco[1] : resposta).trim();
}

async function logarErro(
  supabase: SupabaseClient,
  params: { tenantId: string; tribunalOrigem: string; campo: CampoExtraido },
  motivo: MotivoFalhaAprendizado,
  detalhes: unknown,
) {
  await supabase.from("motor_extracao_log").insert({
    tipo: "erro",
    tenant_id: params.tenantId,
    tribunal_origem: params.tribunalOrigem,
    detalhes: { motivo, campo: params.campo, ...(typeof detalhes === "object" && detalhes ? detalhes : { detalhes }) },
  });
}

// Reexporta pra quem só precisa checar se vale acionar essa camada.
export { deveGerarRegexNovo } from "./detector-padroes-repetidos";
