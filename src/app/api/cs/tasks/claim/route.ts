import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const LEASE_MINUTES = 10;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

const TASK_COLUMNS =
  "id, parent_task_id, source, type, processo_id, cnj, status, priority, cursor, attempt, idempotency_key";

/**
 * POST /api/cs/tasks/claim
 *
 * Reserva até `limit` tarefas pendentes (ou com lease expirado) pro device
 * autenticado. Claim atômico por linha — cada UPDATE só afeta a tarefa se
 * ela ainda estiver no estado esperado (checado de novo na cláusula WHERE
 * com o status/lease já conhecido daquela linha), então dois devices
 * concorrentes nunca fecham a mesma tarefa (docs/roadmap/
 * 23-meujudi-cs-v0.3.0-refatoracao.md Fase 3, critério "duas instâncias
 * não executam a mesma tarefa").
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // sem body, usa defaults
  }
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));
  const sources = Array.isArray(body.sources) ? body.sources.filter((s) => typeof s === "string") : null;

  const now = new Date().toISOString();
  const expiredClause = `and(status.in.(claimed,running),lease_expires_at.lt.${now})`;

  let query = supabase
    .from("sync_tasks")
    .select("id, status, attempt, started_at")
    .eq("tenant_id", device.tenantId)
    .or(`status.eq.pending,${expiredClause}`)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(limit * 3);

  if (sources && sources.length > 0) query = query.in("source", sources);

  const { data: candidates, error: candidatesError } = await query;
  if (candidatesError) {
    console.error("[cs/tasks/claim] falha ao buscar candidatas:", candidatesError);
    return NextResponse.json({ error: "fila_indisponivel" }, { status: 500 });
  }

  const leaseExpiresAt = new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString();
  const claimed: Record<string, unknown>[] = [];

  for (const candidate of candidates ?? []) {
    if (claimed.length >= limit) break;

    const { data: updated, error: updateError } = await supabase
      .from("sync_tasks")
      .update({
        status: "claimed",
        device_id: device.deviceId,
        lease_expires_at: leaseExpiresAt,
        attempt: (candidate.attempt ?? 0) + 1,
        started_at: candidate.started_at ?? now,
        last_activity_at: now,
      })
      .eq("id", candidate.id)
      .eq("tenant_id", device.tenantId)
      .eq("status", candidate.status)
      .select(TASK_COLUMNS)
      .maybeSingle();

    if (updateError) {
      console.error("[cs/tasks/claim] falha ao reservar tarefa:", updateError);
      continue;
    }
    if (updated) claimed.push(updated);
  }

  return NextResponse.json({ tasks: claimed, leaseExpiresAt });
}
