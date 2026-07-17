// Golden dataset: conjunto de casos de teste fixos que toda regex precisa
// passar antes de virar 'confiavel'. Ver docs/roadmap/08-ia-regex.md seção 9.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoExtraido } from "@/lib/ia/types";

export interface CasoFalho {
  texto: string;
  esperado: boolean;
  obtido: boolean;
}

export interface ResultadoGoldenDataset {
  passou: boolean;
  totalCasos: number;
  casosFalhos: CasoFalho[];
}

interface GoldenDatasetCaso {
  texto: string;
  deveria_casar: boolean;
}

/**
 * Roda uma regex candidata contra todo o golden dataset do campo dela. Só
 * passa se acertar 100% dos casos — âncoras devem casar, armadilhas NÃO
 * devem casar. Um dataset vazio pra esse campo não bloqueia nada (ainda não
 * há casos cadastrados) — isso é intencional, ver armadilhas conhecidas.
 */
export async function rodarGoldenDataset(
  supabase: SupabaseClient,
  padrao: string,
  flags: string,
  campo: CampoExtraido,
): Promise<ResultadoGoldenDataset> {
  const { data: casos } = await supabase
    .from("golden_dataset_casos")
    .select("texto, deveria_casar")
    .eq("campo", campo);

  if (!casos || casos.length === 0) {
    return { passou: true, totalCasos: 0, casosFalhos: [] };
  }

  let re: RegExp;
  try {
    re = new RegExp(padrao, flags);
  } catch {
    return {
      passou: false,
      totalCasos: casos.length,
      casosFalhos: (casos as GoldenDatasetCaso[]).map((c) => ({ texto: c.texto, esperado: c.deveria_casar, obtido: false })),
    };
  }

  const casosFalhos: CasoFalho[] = [];
  for (const caso of casos as GoldenDatasetCaso[]) {
    const bateu = re.test(caso.texto);
    if (bateu !== caso.deveria_casar) {
      casosFalhos.push({ texto: caso.texto, esperado: caso.deveria_casar, obtido: bateu });
    }
  }

  return { passou: casosFalhos.length === 0, totalCasos: casos.length, casosFalhos };
}
