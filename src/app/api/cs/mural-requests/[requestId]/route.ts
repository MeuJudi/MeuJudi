import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ requestId: string }> }) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { requestId } = await context.params;
  const body = await request.json().catch(() => ({})) as { ok?: boolean; result?: unknown; error?: string };
  const status = body.ok ? "completed" : "failed";
  const { error } = await supabase
    .from("cs_mural_requests")
    .update({ status, result: body.result ?? null, error_message: body.error ?? null, completed_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("tenant_id", device.tenantId)
    .eq("status", "processing");
  if (error) return NextResponse.json({ error: "solicitacao_nao_atualizada" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
