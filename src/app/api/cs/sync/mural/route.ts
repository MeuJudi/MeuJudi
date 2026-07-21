import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";
import { processarComunicacao } from "@/lib/mural/processar-comunicacao";
import type { MuralComunicacao } from "@/lib/mural/client";

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
    for (const item of body.comunicacoes as MuralComunicacao[]) {
      try {
        const nova = await processarComunicacao(supabase, device.tenantId, item);
        if (nova) novas++;
        else puladas++;
      } catch (error) {
        erros++;
        console.error("[cs/sync/mural] item rejeitado:", error);
      }
    }
    return NextResponse.json({ recebidas: body.comunicacoes.length, novas, puladas, erros });
  } catch (error) {
    console.error("[cs/sync/mural] erro:", error);
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 });
  }
}
