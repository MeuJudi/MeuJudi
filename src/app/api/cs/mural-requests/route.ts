import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  // Busca até 5 pedidos pendentes para as OABs deste tenant
  const { data: requests, error } = await supabase
    .from("cs_mural_requests")
    .select("id, oab_number, oab_uf, data_inicio, data_fim")
    .eq("tenant_id", device.tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return NextResponse.json({ error: "solicitacoes_nao_carregadas" }, { status: 500 });

  // Marca como "processing" pra ninguém mais pegar
  const ids = (requests ?? []).map((item) => item.id);
  if (ids.length > 0) {
    await supabase
      .from("cs_mural_requests")
      .update({ status: "processing", claimed_at: new Date().toISOString() })
      .in("id", ids)
      .eq("tenant_id", device.tenantId)
      .eq("status", "pending");
  }

  return NextResponse.json({ requests: requests ?? [] });
}
