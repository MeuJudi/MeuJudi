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
  },
): Promise<void> {
  const dataFatal = calcularPrazoFatal(params.dataReferencia, params.prazoDias);

  await supabase
    .from("processos")
    .update({ prazo_proxima_resposta: dataFatal })
    .eq("id", params.processoId)
    .eq("tenant_id", params.tenantId);

  await supabase.from("agenda_eventos").upsert(
    {
      tenant_id: params.tenantId,
      processo_id: params.processoId,
      tipo: "prazo",
      titulo: `Prazo: ${params.prazoDias} dias`,
      descricao: params.descricao ?? null,
      data_inicio: dataFatal,
      fonte: params.fonte,
      fonte_id: params.fonteId ?? null,
    },
    { onConflict: "tenant_id,fonte,fonte_id" },
  );
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
    descricao?: string | null;
  },
): Promise<void> {
  await supabase
    .from("processos")
    .update({ proxima_audiencia: params.dataAudienciaIso })
    .eq("id", params.processoId)
    .eq("tenant_id", params.tenantId);

  await supabase.from("agenda_eventos").upsert(
    {
      tenant_id: params.tenantId,
      processo_id: params.processoId,
      tipo: "audiencia",
      titulo: params.titulo ?? "Audiência",
      descricao: params.descricao ?? null,
      data_inicio: params.dataAudienciaIso,
      fonte: params.fonte,
      fonte_id: params.fonteId ?? null,
    },
    { onConflict: "tenant_id,fonte,fonte_id" },
  );
}
