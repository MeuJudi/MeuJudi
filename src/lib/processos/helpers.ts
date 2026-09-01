import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST devolve no máximo 1000 linhas por request por padrão — sem
// paginar, um tenant com mais de 1000 participações (ex.: escritório com
// muitas OABs/processos) ficava com a lista de IDs silenciosamente cortada
// em 1000, sem erro nenhum, só um "Processos ativos: 1000" sempre travado
// nesse teto (achado 01/09/2026). Pagina com `.range()` até esgotar.
const PARTICIPANTES_PAGE_SIZE = 1000;

/**
 * Retorna os IDs (dedupados) de processos que o tenant participa (via
 * processo_participantes). Usado para substituir filtros diretos por
 * tenant_id na tabela processos, já que processos.tenant_id não é mais
 * autoritativo pra processo compartilhado.
 */
export async function getProcessIdsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const ids: string[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("processo_participantes")
      .select("processo_id")
      .eq("tenant_id", tenantId)
      .range(from, from + PARTICIPANTES_PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar processos do escritório: ${error.message}`);
    const page = data ?? [];
    ids.push(...page.map((p) => p.processo_id));
    if (page.length < PARTICIPANTES_PAGE_SIZE) break;
    from += PARTICIPANTES_PAGE_SIZE;
  }
  return [...new Set(ids)];
}

/**
 * Verifica se um processo específico pertence ao tenant (via processo_participantes).
 */
export async function isProcessLinkedToTenant(
  supabase: SupabaseClient,
  processoId: string,
  tenantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("processo_participantes")
    .select("id")
    .eq("processo_id", processoId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !!data;
}
