import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const LEASE_MINUTES = 10;

/**
 * POST /api/cs/tasks/{taskId}/heartbeat
 *
 * Renova o lease de uma tarefa em execução e opcionalmente atualiza o
 * cursor/checkpoint — permite retomar do ponto certo se o CS cair no meio
 * (docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 3).
 * Body opcional: { cursor?, counters? }
 */
export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { taskId } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // sem body, só renova o lease
  }

  const update: Record<string, unknown> = {
    status: "running",
    lease_expires_at: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
    last_activity_at: new Date().toISOString(),
  };
  if (body.cursor !== undefined) update.cursor = body.cursor;
  if (body.counters !== undefined) update.counters = body.counters;

  const { data: updated, error } = await supabase
    .from("sync_tasks")
    .update(update)
    .eq("id", taskId)
    .eq("tenant_id", device.tenantId)
    .eq("device_id", device.deviceId)
    .in("status", ["claimed", "running"])
    .select("id, status, lease_expires_at")
    .maybeSingle();

  if (error) {
    console.error("[cs/tasks/heartbeat] falha ao renovar lease:", error);
    return NextResponse.json({ error: "heartbeat_nao_registrado" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "tarefa_nao_reservada_por_este_device" }, { status: 409 });

  return NextResponse.json({ ok: true, leaseExpiresAt: updated.lease_expires_at });
}
