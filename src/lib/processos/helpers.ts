import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Retorna os IDs de processos que o tenant participa (via processo_participantes).
 * Usado para substituir filtros diretos por tenant_id na tabela processos.
 */
export async function getProcessIdsForTenant(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("processo_participantes")
    .select("processo_id")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(`Falha ao buscar processos do escritório: ${error.message}`);
  return (data ?? []).map((p) => p.processo_id);
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
