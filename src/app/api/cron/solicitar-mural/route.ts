// Cron: cria tarefas de consulta ao Mural para o CS (fila unificada
// sync_tasks — ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 7).
// Roda periodicamente (a cada 6h via cron-job.org ou Vercel cron).
// Para cada OAB ativa do sistema, cria uma tarefa mural_request que o
// SyncWorker do CS reserva no próximo ciclo, busca no PJe e devolve via
// /api/cs/sync/mural.

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

/** Janela padrão: últimos 30 dias (se nunca sincronizou) */
const JANELA_PADRAO_DIAS = 30;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. Busca OABs ativas com tenant ativo
  const { data: oabs, error: oabsError } = await supabase
    .from("escritorio_oabs")
    .select("tenant_id, oab_number, oab_uf, tenants!inner(is_active, access_status)")
    .eq("is_active", true)
    .eq("tenants.is_active", true)
    .eq("tenants.access_status", "liberado");

  if (oabsError) return NextResponse.json({ error: oabsError.message }, { status: 500 });
  if (!oabs || oabs.length === 0) {
    return NextResponse.json({ criados: 0, motivo: "nenhuma_oab_ativa" });
  }

  let criados = 0;
  let pulados = 0;
  let erros = 0;

  const now = new Date();
  // Um id por tenant nesta execução — agrupa a solicitação de várias OABs
  // do mesmo escritório como um lote só na tela de fila do CS.
  const batchIdPorTenant = new Map<string, string>();

  for (const oab of oabs) {
    try {
      // Último sync concluído desta OAB, pra saber de onde retomar a janela.
      const { data: ultimoSync } = await supabase
        .from("sync_tasks")
        .select("completed_at")
        .eq("tenant_id", oab.tenant_id)
        .eq("source", "mural")
        .eq("type", "mural_request")
        .contains("cursor", { oabNumber: oab.oab_number, oabUf: oab.oab_uf })
        .in("status", ["completed", "completed_with_warnings"])
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const dataInicio = ultimoSync?.completed_at
        ? new Date(ultimoSync.completed_at)
        : new Date(now.getTime() - JANELA_PADRAO_DIAS * 24 * 60 * 60 * 1000);
      const dataInicioStr = dataInicio.toISOString().split("T")[0];
      const dataFimStr = now.toISOString().split("T")[0];

      // Chave de dedup: enquanto essa janela não for concluída, criar de
      // novo com a mesma chave é ignorado (409) — substitui a checagem
      // manual de "pedido pendente" que existia antes.
      if (!batchIdPorTenant.has(oab.tenant_id)) batchIdPorTenant.set(oab.tenant_id, randomUUID());
      const { error: insertError } = await supabase.from("sync_tasks").insert({
        tenant_id: oab.tenant_id,
        source: "mural",
        type: "mural_request",
        idempotency_key: `mural_request:${oab.oab_number}:${oab.oab_uf}:${dataInicioStr}`,
        priority: 5,
        cursor: { oabNumber: oab.oab_number, oabUf: oab.oab_uf, dataInicio: dataInicioStr, dataFim: dataFimStr },
        batch_id: batchIdPorTenant.get(oab.tenant_id),
      });

      if (insertError) {
        if (insertError.code === "23505") {
          pulados++;
        } else {
          console.error(`[solicitar-mural] erro ao criar tarefa OAB ${oab.oab_number}/${oab.oab_uf}:`, insertError.message);
          erros++;
        }
      } else {
        criados++;
      }
    } catch (error) {
      console.error(`[solicitar-mural] erro inesperado OAB ${oab.oab_number}/${oab.oab_uf}:`, error);
      erros++;
    }
  }

  console.log(`[solicitar-mural] concluído: ${criados} criados, ${pulados} pulados, ${erros} erros, ${oabs.length} OABs total`);

  return NextResponse.json({
    oabs_total: oabs.length,
    criados,
    pulados,
    erros,
  });
}
