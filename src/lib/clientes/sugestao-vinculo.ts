// Sugestão de vínculo cliente<->processo (Sprint 2): quando o Mural descobre
// um processo novo, o nome de cada parte é comparado (via pg_trgm, migration
// 20260722000002) contra os clientes já cadastrados do tenant. Nunca vincula
// ou cria cliente sozinho — nome não é identificador único (sem CPF
// disponível nas APIs públicas), então toda decisão fica pendente de
// confirmação humana em monitoramento/sugestoes-cliente.

import type { SupabaseClient } from "@supabase/supabase-js";

const LIMIAR_SIMILARIDADE = 0.35;

export type PoloParte = "autor" | "reu";

export async function sugerirVinculoCliente(
  supabase: SupabaseClient,
  tenantId: string,
  processoId: string,
  nomeDetectado: string,
  polo: PoloParte,
): Promise<void> {
  const { data: candidatos } = await supabase.rpc("buscar_cliente_similar", {
    p_tenant_id: tenantId,
    p_nome: nomeDetectado,
  });

  const melhorCandidato = candidatos?.[0] as
    | { cliente_id: string; nome: string; similaridade: number }
    | undefined;

  const achouMatch = melhorCandidato != null && melhorCandidato.similaridade >= LIMIAR_SIMILARIDADE;

  await supabase.from("sugestoes_vinculo_cliente").upsert(
    {
      tenant_id: tenantId,
      processo_id: processoId,
      nome_detectado: nomeDetectado,
      polo,
      cliente_id_sugerido: achouMatch ? melhorCandidato.cliente_id : null,
      similaridade: melhorCandidato?.similaridade ?? null,
      tipo: achouMatch ? "vincular_existente" : "criar_novo",
    },
    { onConflict: "processo_id,nome_detectado", ignoreDuplicates: true },
  );
}
