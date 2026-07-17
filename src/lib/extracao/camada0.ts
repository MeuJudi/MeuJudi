// Camada 0 — Roteador de fonte: decide se um campo já vem estruturado
// (sincronizado na tabela `processos` por DataJud/Mural/PJe CS) antes de
// gastar regex ou IA extraindo do texto livre de uma movimentação/comunicação.
//
// Ver docs/roadmap/08-ia-regex.md seção 3.
//
// IMPORTANTE (correção de arquitetura, 17/07/2026): o desenho original
// assumia chamar a API do PJe diretamente (`PJeAPI.getPauta()`) a partir do
// pipeline de extração. Isso não é possível — `PJeAPI` roda só dentro do
// processo Electron do MeuJudi CS, no PC do advogado, nunca é alcançável
// pelo servidor Next.js. A arquitetura real é: o MeuJudi CS (e, no futuro,
// os crons de DataJud/Mural) sincronizam dados PARA a tabela `processos`
// (colunas `proxima_audiencia`, `valor_causa`, `advogados`, etc). A Camada 0
// só precisa checar essas colunas — não importa qual processo as populou.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoExtraido } from "@/lib/ia/types";

export interface ResultadoCamada0 {
  resolvido: boolean;
  valor?: unknown;
  fonte?: "processos_estruturado";
}

interface ProcessoEstruturado {
  proxima_audiencia: string | null;
  valor_causa: number | null;
  prazo_proxima_resposta: string | null;
  advogados: unknown;
}

/**
 * Tenta resolver um campo a partir dos dados já sincronizados e estruturados
 * na tabela `processos`, sem gastar regex/IA. Dado estruturado NÃO tem
 * "confiança" — é leitura direta do registro já sincronizado, não uma
 * extração probabilística. O único tratamento de erro aqui é de engenharia
 * normal (processo não encontrado, coluna nula), não de interpretação.
 */
export async function resolverViaDadosEstruturados(
  supabase: SupabaseClient,
  processoId: string,
  campo: CampoExtraido,
): Promise<ResultadoCamada0> {
  const { data, error } = await supabase
    .from("processos")
    .select("proxima_audiencia, valor_causa, prazo_proxima_resposta, advogados")
    .eq("id", processoId)
    .maybeSingle<ProcessoEstruturado>();

  if (error || !data) {
    return { resolvido: false };
  }

  switch (campo) {
    case "audiencia":
      if (data.proxima_audiencia) {
        return { resolvido: true, valor: data.proxima_audiencia, fonte: "processos_estruturado" };
      }
      return { resolvido: false };

    case "valor":
      if (data.valor_causa != null) {
        return { resolvido: true, valor: data.valor_causa, fonte: "processos_estruturado" };
      }
      return { resolvido: false };

    case "prazo":
      if (data.prazo_proxima_resposta) {
        return { resolvido: true, valor: data.prazo_proxima_resposta, fonte: "processos_estruturado" };
      }
      return { resolvido: false };

    case "oab":
      if (Array.isArray(data.advogados) && data.advogados.length > 0) {
        return { resolvido: true, valor: data.advogados, fonte: "processos_estruturado" };
      }
      return { resolvido: false };

    default:
      return { resolvido: false };
  }
}
