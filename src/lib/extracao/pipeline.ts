// Pipeline de extração completo: Camada 0 (dados estruturados) -> Camadas
// -1/1/2 (cache + regex + validação básica, Parte 3) -> Camada 3 (IA
// confirmadora, Haiku) -> Camada 4 (IA generalista, Sonnet) -> Camada 5
// (auto-correção, Opus, quando o mesmo campo precisa de Camada 4 repetidas
// vezes sem regex). Camada 6 (revisão humana) entra na próxima parte.

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverViaDadosEstruturados } from "./camada0";
import { executarRegex } from "@/lib/regex/engine";
import { executarCamada3 } from "@/lib/ia/confirmadora";
import { extrairComIAGeneralista } from "@/lib/ia/generalista";
import { deveGerarRegexNovo } from "@/lib/ia/detector-padroes-repetidos";
import { aprenderRegex } from "@/lib/ia/aprender-regex";
import type { ContextoProcesso } from "@/lib/ia/prompts";
import type { CampoExtraido, MatchResult, NivelConfianca } from "@/lib/ia/types";

export type OrigemResultado =
  | "estruturado"
  | "regex_direto"
  | "ia_confirmadora"
  | "ia_generalista"
  | "nao_resolvido";

export interface ResultadoExtracao {
  origem: OrigemResultado;
  valor: unknown;
  confianca: NivelConfianca | null;
  /** true quando nenhuma camada teve confiança suficiente — vai pra Central de Revisão (Parte 7). */
  precisaRevisaoHumana: boolean;
  matchResult?: MatchResult;
}

export async function extrairCampo(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    processoId: string;
    texto: string;
    campo: CampoExtraido;
    tribunal: string;
    contextoProcesso: ContextoProcesso;
  },
): Promise<ResultadoExtracao> {
  // CAMADA 0: dado já sincronizado e estruturado? Usa direto, sem custo.
  const viaEstruturado = await resolverViaDadosEstruturados(supabase, params.processoId, params.campo);
  if (viaEstruturado.resolvido) {
    return { origem: "estruturado", valor: viaEstruturado.valor, confianca: null, precisaRevisaoHumana: false };
  }

  // CAMADA -1/1/2 (Parte 3): cache + regex + validação básica.
  const resultadoRegex = await executarRegex(supabase, params.tenantId, params.texto, params.campo);

  if (resultadoRegex.match && resultadoRegex.confianca === "alta") {
    // Já veio do cache ou de regex confiável sem necessidade de amostragem — nada mais a fazer.
    return {
      origem: "regex_direto",
      valor: resultadoRegex.match,
      confianca: "alta",
      precisaRevisaoHumana: false,
      matchResult: resultadoRegex,
    };
  }

  const nenhumRegexBateu = !resultadoRegex.match;

  if (resultadoRegex.match && resultadoRegex.confianca === "media" && resultadoRegex.regexId) {
    // CAMADA 3: regex bateu mas essa amostra precisa de validação por IA.
    const resultadoCamada3 = await executarCamada3(supabase, {
      regexId: resultadoRegex.regexId,
      padrao: resultadoRegex.regexUsada ?? "",
      match: resultadoRegex.match,
      texto: params.texto,
      tenantId: params.tenantId,
      tribunalOrigem: params.tribunal,
      campo: params.campo,
    });

    if (resultadoCamada3.resolvido) {
      return {
        origem: "ia_confirmadora",
        valor: resultadoCamada3.valor,
        confianca: "alta",
        precisaRevisaoHumana: false,
        matchResult: resultadoRegex,
      };
    }
    // precisaCamada4 === true: continua abaixo, sem penalizar a regex
    // (a IA discordou ou falhou — Camada 4 decide do zero).
  }

  // CAMADA 4: nenhum regex bateu, ou a Camada 3 não confirmou — extração completa do zero.
  const resultadoCamada4 = await extrairComIAGeneralista(params.texto, params.contextoProcesso);

  const precisaRevisao = resultadoCamada4.incerto || resultadoCamada4.confianca !== "alta";

  // CAMADA 5 (auto-correção): só quando NENHUM regex bateu (não quando a
  // Camada 3 só discordou de um match existente) e a Camada 4 resolveu com
  // confiança alta — sinal de que vale a pena aprender um regex novo pra
  // não pagar Sonnet de novo no próximo caso igual.
  if (nenhumRegexBateu) {
    await supabase.from("motor_extracao_log").insert({
      tipo: "ia_generalista_sem_regex",
      tenant_id: params.tenantId,
      tribunal_origem: params.tribunal,
      detalhes: { campo: params.campo },
    });

    if (!precisaRevisao) {
      const deveGerar = await deveGerarRegexNovo(supabase, params.tenantId, params.campo);
      if (deveGerar) {
        // Fire-and-forget seria arriscado aqui (Camada 5 é rara, mas ainda
        // assim vale aguardar o resultado pra não perder erro silenciosamente).
        await aprenderRegex(supabase, {
          texto: params.texto,
          campo: params.campo,
          camposExtraidos: resultadoCamada4 as unknown as Record<string, unknown>,
          tenantId: params.tenantId,
          tribunalOrigem: params.tribunal,
        });
      }
    }
  }

  return {
    origem: "ia_generalista",
    valor: resultadoCamada4,
    confianca: resultadoCamada4.confianca,
    precisaRevisaoHumana: precisaRevisao, // vai pra Central de Revisão (Parte 7) se true
  };
}
