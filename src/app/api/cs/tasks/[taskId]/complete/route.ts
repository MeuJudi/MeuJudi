import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const TERMINAL_OR_PAUSED = [
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
  "paused_login_required",
  "paused_rate_limit",
] as const;

type FinalStatus = (typeof TERMINAL_OR_PAUSED)[number];

/**
 * POST /api/cs/tasks/{taskId}/complete
 *
 * Fecha (ou pausa) uma tarefa reservada por este device. Body:
 * { status, cursor?, counters?, errorCode?, errorMessage? }
 *
 * Pausar com paused_login_required/paused_rate_limit não é terminal — a
 * tarefa fica fora da fila de claim (lease_expires_at null) até alguém
 * criar uma nova rodada; isso evita retry em loop quando a causa raiz
 * (sessão expirada, rate limit) ainda não foi resolvida.
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
    return NextResponse.json({ error: "corpo_invalido" }, { status: 400 });
  }

  const status = typeof body.status === "string" ? body.status : "";
  if (!TERMINAL_OR_PAUSED.includes(status as FinalStatus)) {
    return NextResponse.json({ error: "status_invalido" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const isTerminal = status === "completed" || status === "completed_with_warnings" || status === "failed" || status === "cancelled";

  const update: Record<string, unknown> = {
    status,
    lease_expires_at: null,
    last_activity_at: now,
  };
  if (isTerminal) update.completed_at = now;
  if (body.cursor !== undefined) update.cursor = body.cursor;
  if (body.counters !== undefined) update.counters = body.counters;
  if (body.errorCode !== undefined) update.error_code = String(body.errorCode).slice(0, 60);
  if (body.errorMessage !== undefined) update.error_message = String(body.errorMessage).slice(0, 500);

  const { data: updated, error } = await supabase
    .from("sync_tasks")
    .update(update)
    .eq("id", taskId)
    .eq("tenant_id", device.tenantId)
    .eq("device_id", device.deviceId)
    .in("status", ["claimed", "running"])
    .select("id, status")
    .maybeSingle();

  if (error) {
    console.error("[cs/tasks/complete] falha ao finalizar tarefa:", error);
    return NextResponse.json({ error: "conclusao_nao_registrada" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "tarefa_nao_reservada_por_este_device" }, { status: 409 });

  return NextResponse.json({ ok: true, status: updated.status });
}
