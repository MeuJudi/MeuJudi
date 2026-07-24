// Detecta quando vale a pena acionar a Camada 5 (Opus sugere regex nova):
// só quando o mesmo campo já precisou da Camada 4 (sem nenhum regex bater)
// repetidas vezes — Opus é caro o suficiente pra não rodar a cada caso
// isolado. Ver docs/roadmap/08-ia-regex.md seção 7.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoExtraido } from "./types";

const LIMITE_REPETICOES_PARA_SUGERIR_REGEX = 3;
const JANELA_DIAS = 7;

// Sem isso, uma vez que o gatilho liga (>=3 repetições na janela acima), ele
// nunca mais desliga: toda extração seguinte pro mesmo tenant+campo dispara
// uma nova tentativa de Camada 5 (Opus), mesmo que a tentativa anterior
// tenha falhado segundos antes. Foi exatamente isso que causou uma rajada de
// ~20 chamadas de Opus em 2 minutos rodando a OAB de um cliente real
// (achado de 24/07/2026) — cada tentativa (sucesso ou falha) já paga o
// modelo mais caro do catálogo antes de qualquer trava de segurança decidir
// se a regex é aceita. O cooldown dá um intervalo mínimo entre tentativas.
const COOLDOWN_HORAS_ENTRE_TENTATIVAS = 6;

/**
 * Decide se vale acionar a Camada 5 pra esse tenant+campo: precisa ter
 * precisado da Camada 4 (sem nenhum regex bater) pelo menos
 * `LIMITE_REPETICOES_PARA_SUGERIR_REGEX` vezes nos últimos `JANELA_DIAS`
 * (evento 'ia_generalista_sem_regex' em `motor_extracao_log` — ver Parte 6)
 * E não ter havido nenhuma tentativa de Camada 5 (sucesso ou falha, eventos
 * 'regex_criada'/'erro') nas últimas `COOLDOWN_HORAS_ENTRE_TENTATIVAS` horas.
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

  if ((count ?? 0) < LIMITE_REPETICOES_PARA_SUGERIR_REGEX) return false;

  const { data: ultimaTentativa } = await supabase
    .from("motor_extracao_log")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .in("tipo", ["regex_criada", "erro"])
    .eq("detalhes->>campo", campo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultimaTentativa) return true;

  const desdeUltimaTentativaMs = Date.now() - new Date(ultimaTentativa.created_at).getTime();
  return desdeUltimaTentativaMs >= COOLDOWN_HORAS_ENTRE_TENTATIVAS * 60 * 60 * 1000;
}
