// Detecta quando vale a pena acionar a Camada 5 (Opus sugere regex nova):
// só quando o mesmo campo já precisou da Camada 4 (sem nenhum regex bater)
// repetidas vezes — Opus é caro o suficiente pra não rodar a cada caso
// isolado. Ver docs/roadmap/08-ia-regex.md seção 7.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoExtraido } from "./types";

const LIMITE_REPETICOES_PARA_SUGERIR_REGEX = 3;
const JANELA_DIAS = 7;

/**
 * Conta quantas vezes, nos últimos `JANELA_DIAS`, esse tenant precisou da
 * Camada 4 pra esse campo sem nenhum regex bater (evento
 * 'ia_generalista_sem_regex' em `motor_extracao_log` — ver Parte 6).
 */
export async function deveGerarRegexNovo(
  supabase: SupabaseClient,
  tenantId: string,
  campo: CampoExtraido,
): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_DIAS * 24 * 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from("motor_extracao_log")
    .select("*", { count: "exact", head: true })
    .eq("tipo", "ia_generalista_sem_regex")
    .eq("tenant_id", tenantId)
    .eq("detalhes->>campo", campo)
    .gte("created_at", desde);

  return (count ?? 0) >= LIMITE_REPETICOES_PARA_SUGERIR_REGEX;
}
