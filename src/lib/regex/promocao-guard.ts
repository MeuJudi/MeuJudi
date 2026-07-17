// Guard chamado depois de `check_regex_transition` (Parte 3): se a regex
// acabou de virar 'confiavel', roda o golden dataset ANTES de considerar a
// promoção definitiva. Se falhar, reverte pra 'quente' — mantém a métrica
// ao vivo intacta, só não confia ainda. Ver docs/roadmap/08-ia-regex.md seção 9.

import type { SupabaseClient } from "@supabase/supabase-js";
import { rodarGoldenDataset } from "./golden-dataset";
import type { CampoExtraido, EstadoRegex } from "@/lib/ia/types";

interface RegexParaValidar {
  id: string;
  pattern: string;
  flags: string;
  state: EstadoRegex;
}

/**
 * Chamar sempre depois de `check_regex_transition` retornar um novo estado.
 * Só age quando o novo estado é 'confiavel' — nos demais casos não faz nada.
 */
export async function validarPromocaoParaConfiavel(
  supabase: SupabaseClient,
  regexId: string,
  campo: CampoExtraido,
): Promise<void> {
  const { data: regex } = await supabase
    .from("regex_metadata")
    .select("id, pattern, flags, state")
    .eq("id", regexId)
    .maybeSingle<RegexParaValidar>();

  if (!regex || regex.state !== "confiavel") return;

  const resultado = await rodarGoldenDataset(supabase, regex.pattern, regex.flags || "i", campo);

  if (!resultado.passou) {
    await supabase.from("regex_metadata").update({ state: "quente" }).eq("id", regexId);

    await supabase.from("motor_extracao_log").insert({
      tipo: "mudanca_estado",
      regex_id: regexId,
      detalhes: {
        motivo: "promocao_revertida_falhou_golden_dataset",
        casos_falhos: resultado.casosFalhos,
      },
    });
  }
}
