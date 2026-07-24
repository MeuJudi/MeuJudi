// Camada 6 — Central de Revisão: cria o item pendente quando o pipeline
// (Parte 5) sinaliza `precisaRevisaoHumana: true`. Ver docs/roadmap/08-ia-regex.md seção 8.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CampoExtraido, NivelConfianca } from "@/lib/ia/types";
import type { ResultadoExtracao } from "./pipeline";

export async function criarItemRevisao(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    processoId: string;
    campo: CampoExtraido;
    tribunalOrigem: string;
    textoOriginal: string;
    trechoDestacado?: string;
    resultado: ResultadoExtracao;
  },
): Promise<void> {
  if (!params.resultado.precisaRevisaoHumana) return;

  const confianca: NivelConfianca = params.resultado.confianca ?? "baixa";
  // itens_revisao só aceita 'media' | 'baixa' — nunca deveria chegar aqui
  // com 'alta' (precisaRevisaoHumana só é true quando a confiança NÃO é alta).
  const confiancaRevisao = confianca === "alta" ? "media" : confianca;

  const { error } = await supabase.from("itens_revisao").insert({
    tenant_id: params.tenantId,
    processo_id: params.processoId,
    // Propaga o regex que gerou o palpite, se houver (ex.: regex bateu mas
    // ficou bloqueado por custo, ou a Camada 3 discordou e caiu pra Camada 4).
    // Sem isso, a correção do advogado (Parte 7) nunca conseguiria alimentar
    // de volta o aprendizado daquela regex específica — achado numa auditoria
    // completa da Parte 1-10, 21/07/2026.
    regex_id: params.resultado.matchResult?.regexId ?? null,
    campo: params.campo,
    tribunal_origem: params.tribunalOrigem,
    texto_original: params.textoOriginal,
    trecho_destacado: params.trechoDestacado ?? null,
    valor_sugerido: params.resultado.valor as Record<string, unknown>,
    confianca: confiancaRevisao,
    origem: params.resultado.origem,
  });

  if (error) {
    // Camada 6 é o último degrau antes do dado se perder de vez — um insert
    // falho aqui não pode desaparecer em silêncio (achado de 24/07/2026: 22
    // das 25 chamadas de Camada 4 de um teste real nunca apareceram na
    // Central de Revisão, sem nenhum log do motivo). Não relança: quem chama
    // `criarItemRevisao` já processou a extração com sucesso, e ela não deve
    // virar "erro" só porque o registro de auditoria falhou — mas o evento
    // fica visível no feed do Motor de Extração.
    console.error("[central-revisao] Falha ao criar item de revisão:", error.message);
    await supabase.from("motor_extracao_log").insert({
      tipo: "erro",
      tenant_id: params.tenantId,
      tribunal_origem: params.tribunalOrigem,
      detalhes: {
        motivo: "itens_revisao_insert_falhou",
        campo: params.campo,
        processo_id: params.processoId,
        erro: error.message,
      },
    });
  }
}
