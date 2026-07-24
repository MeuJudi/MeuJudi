import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * POST /api/cs/heartbeat
 *
 * Recebe heartbeat do CS (a cada 5 min).
 * Body opcional: { status, lastActivity, pendingTasks, version }
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) {
    return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // sem body, tudo bem
  }

  const status = body.status === "error" ? "error" : "online";
  const pendingTasks = typeof body.pendingTasks === "number" && Number.isFinite(body.pendingTasks)
    ? Math.max(0, Math.min(10000, Math.floor(body.pendingTasks)))
    : 0;
  const lastActivity = typeof body.lastActivity === "string" ? body.lastActivity.slice(0, 120) : null;
  const appVersion = typeof body.version === "string" ? body.version.slice(0, 40) : null;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("cs_devices")
    .update({
      last_heartbeat: now,
      status,
      app_version: appVersion,
      last_activity: lastActivity,
      pending_tasks: pendingTasks,
    })
    .eq("id", device.deviceId);

  if (error) {
    console.error("[cs/heartbeat] falha ao atualizar presença:", error);
    return NextResponse.json({ error: "heartbeat_nao_registrado" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    receivedAt: now,
  });
}
