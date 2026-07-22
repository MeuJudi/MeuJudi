import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { data: requests, error } = await supabase
    .from("cs_mural_requests")
    .select("id, process_id, data_inicio, data_fim")
    .eq("tenant_id", device.tenantId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(5);
  if (error) return NextResponse.json({ error: "solicitacoes_nao_carregadas" }, { status: 500 });

  const ids = (requests ?? []).map((item) => item.id);
  if (ids.length > 0) {
    await supabase
      .from("cs_mural_requests")
      .update({ status: "processing", claimed_at: new Date().toISOString() })
      .in("id", ids)
      .eq("tenant_id", device.tenantId)
      .eq("status", "pending");
  }

  const withProcesses = await Promise.all((requests ?? []).map(async (item) => {
    const { data: process } = await supabase
      .from("processos")
      .select("cnj")
      .eq("id", item.process_id)
      .eq("tenant_id", device.tenantId)
      .maybeSingle();
    return { ...item, cnj: process?.cnj ?? null };
  }));

  return NextResponse.json({ requests: withProcesses });
}
