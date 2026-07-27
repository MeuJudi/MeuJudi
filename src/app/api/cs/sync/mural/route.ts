import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";
import { processarComunicacao } from "@/lib/mural/processar-comunicacao";
import type { MuralComunicacao } from "@/lib/mural/client";
import { finalizarExecucaoFonte, iniciarExecucaoFonte, reconciliarCoberturaPorSiglas } from "@/lib/tribunais/reconciliar-cobertura";

export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  try {
    const body = await request.json() as { comunicacoes?: unknown };
    if (!Array.isArray(body.comunicacoes) || body.comunicacoes.length > 1000) {
      return NextResponse.json({ error: "comunicacoes_invalidas" }, { status: 400 });
    }
    let novas = 0;
    let puladas = 0;
    let erros = 0;
    const siglas = new Set<string>();
    const auditStartedAt = Date.now();
    const run = await iniciarExecucaoFonte(supabase, "mural", { tenantId: device.tenantId, metadata: { origem: "cs_sync_mural" } });
    for (const item of body.comunicacoes as MuralComunicacao[]) {
      try {
        if (item.siglaTribunal) siglas.add(item.siglaTribunal);
        const nova = await processarComunicacao(supabase, device.tenantId, item);
        if (nova) novas++;
        else puladas++;
      } catch (error) {
        erros++;
        console.error("[cs/sync/mural] item rejeitado:", error);
      }
    }
    let coberturaAtualizada = true;
    try {
      await reconciliarCoberturaPorSiglas(supabase, siglas, "mural");
    } catch (error) {
      coberturaAtualizada = false;
      console.error("[cs/sync/mural] cobertura nao atualizada:", error);
    }
    await finalizarExecucaoFonte(supabase, run?.id ?? null, {
      status: erros > 0 || !coberturaAtualizada ? "partial" : "completed", itemsRead: body.comunicacoes.length,
      itemsCreated: novas, itemsUpdated: puladas, metadata: { siglas: [...siglas], erros },
    }, auditStartedAt);
    return NextResponse.json({ recebidas: body.comunicacoes.length, novas, puladas, erros, cobertura_atualizada: coberturaAtualizada });
  } catch (error) {
    console.error("[cs/sync/mural] erro:", error);
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 });
  }
}
