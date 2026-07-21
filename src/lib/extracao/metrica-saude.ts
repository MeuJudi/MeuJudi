// Termômetro principal de "o sistema está aprendendo de verdade": essa
// porcentagem deve CAIR mês a mês se o aprendizado estiver funcionando.
// Consumido pelo dashboard do Super Admin (Parte 10).
// Ver docs/roadmap/08-ia-regex.md seção 8.3.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function calcularPercentualRevisaoHumana(
  supabase: SupabaseClient,
  mes: string, // 'YYYY-MM'
): Promise<number> {
  const inicioMes = `${mes}-01`;

  const { count: totalExtracoes } = await supabase
    .from("regex_historico_validacoes")
    .select("*", { count: "exact", head: true })
    .gte("created_at", inicioMes);

  const { count: totalItensRevisao } = await supabase
    .from("itens_revisao")
    .select("*", { count: "exact", head: true })
    .gte("created_at", inicioMes);

  const totalGeral = (totalExtracoes ?? 0) + (totalItensRevisao ?? 0);
  if (totalGeral === 0) return 0;

  return (totalItensRevisao ?? 0) / totalGeral;
}
