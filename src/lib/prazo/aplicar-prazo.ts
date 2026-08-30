// Centraliza "achei um prazo/audiência, aplica no processo" — antes disso
// existia duplicado dentro de cada poller. Também é o que
// coletar-resultados-lote (Sprint 2, fila de lote) usa pra fechar o loop que
// antes deixava o resultado do batch preso sem nunca virar dado usável. Ver
// docs/roadmap/auditoria-motor-extracao/01-fila-lote-beco-sem-saida.md e
// 09-correcao-humana-nao-propaga.md.

import type { SupabaseClient } from "@supabase/supabase-js";
import { calcularPrazoFatal } from "./calcular-prazo-fatal";

export async function aplicarPrazoEncontrado(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    processoId: string;
    prazoDias: number;
    dataReferencia: Date;
    fonte: string;
    fonteId?: string | null;
    descricao?: string | null;
    /**
     * Ato processual já normalizado (ver `extrairNaturezaPrazo` em
     * `@/lib/regex/patterns`) — quando presente, vira o título em vez do
     * genérico "Prazo: N dias" (docs/roadmap/27-nomear-prazo-audiencia.md).
     * É uma heurística de proximidade (não uma regex ancorada como a de
     * audiência), então força `extracaoConfianca` pra "media" mesmo que o
     * chamador tenha passado "alta" — nunca superestima a confiança nessa
     * parte específica da extração.
     */
    naturezaPrazo?: string | null;
    extracaoOrigem?: string | null;
    extracaoConfianca?: string | null;
    textoOrigem?: string | null;
  },
): Promise<void> {
  const dataFatal = calcularPrazoFatal(params.dataReferencia, params.prazoDias);

  await supabase
    .from("processos")
    .update({ prazo_proxima_resposta: dataFatal })
    .eq("id", params.processoId);

  const { error } = await supabase.from("agenda_eventos").upsert(
    {
      tenant_id: params.tenantId,
      processo_id: params.processoId,
      tipo: "prazo",
      titulo: params.naturezaPrazo ? `Prazo para ${params.naturezaPrazo}` : `Prazo: ${params.prazoDias} dias`,
      descricao: params.descricao ?? null,
      data_inicio: dataFatal,
      fonte: params.fonte,
      fonte_id: params.fonteId ?? null,
      extracao_origem: params.extracaoOrigem ?? null,
      extracao_confianca: params.naturezaPrazo ? "media" : (params.extracaoConfianca ?? null),
      texto_origem: params.textoOrigem ?? null,
    },
    { onConflict: "tenant_id,fonte,fonte_id" },
  );
  // Achado em produção (24/07/2026): esse upsert falhava 100% das vezes por
  // incompatibilidade entre o índice único parcial e o ON CONFLICT (ver
  // migration 20260724000002) — sem checar o erro, a falha era invisível e
  // a Agenda nunca recebia os prazos extraídos automaticamente.
  if (error) console.error("[aplicar-prazo] Falha ao gravar evento de prazo na agenda:", error.message);
}

export async function aplicarAudienciaEncontrada(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    processoId: string;
    dataAudienciaIso: string;
    fonte: string;
    fonteId?: string | null;
    titulo?: string | null;
    /**
     * Natureza da audiência já normalizada (ver `normalizarTipoAudiencia`
     * em `@/lib/regex/patterns`) — quando presente, vira o título em vez de
     * `titulo` (docs/roadmap/27-nomear-prazo-audiencia.md). Decisão
     * centralizada aqui pra todo chamador (Mural/PDPJ/fila de lote) ganhar
     * o título específico automaticamente, sem duplicar a lógica de
     * fallback em cada um.
     */
    tipoAudiencia?: string | null;
    descricao?: string | null;
    extracaoOrigem?: string | null;
    extracaoConfianca?: string | null;
    textoOrigem?: string | null;
    /** Link de Zoom/Meet/Teams encontrado no texto de origem, se houver — ver detectar-texto-sem-informacao.ts irmão `extrairLinkVideoconferencia` em patterns.ts. */
    linkVideoconferencia?: string | null;
  },
): Promise<void> {
  await supabase
    .from("processos")
    .update({ proxima_audiencia: params.dataAudienciaIso })
    .eq("id", params.processoId);

  const { error } = await supabase.from("agenda_eventos").upsert(
    {
      tenant_id: params.tenantId,
      processo_id: params.processoId,
      tipo: "audiencia",
      titulo: params.tipoAudiencia ?? params.titulo ?? "Audiência",
      descricao: params.descricao ?? null,
      data_inicio: params.dataAudienciaIso,
      fonte: params.fonte,
      fonte_id: params.fonteId ?? null,
      extracao_origem: params.extracaoOrigem ?? null,
      extracao_confianca: params.extracaoConfianca ?? null,
      texto_origem: params.textoOrigem ?? null,
      link_videoconferencia: params.linkVideoconferencia ?? null,
    },
    { onConflict: "tenant_id,fonte,fonte_id" },
  );
  // Achado em produção (24/07/2026): mesmo bug do upsert de prazo acima —
  // ver migration 20260724000002.
  if (error) console.error("[aplicar-prazo] Falha ao gravar evento de audiência na agenda:", error.message);
}
