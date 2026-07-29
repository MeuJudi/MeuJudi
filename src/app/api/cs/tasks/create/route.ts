import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const VALID_SOURCES = new Set(["datajud", "mural", "pdpj"]);

/**
 * POST /api/cs/tasks/create
 *
 * O device autenticado cria uma nova tarefa na fila unificada — usado hoje
 * pelo worker PDPJ do CS pra disparar a varredura de uma OAB
 * ("sincronizacao individual") e pra criar as tarefas-filha de CNJ
 * descobertas durante essa varredura (Fase 6 de
 * docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md).
 *
 * Dedup: `idempotency_key` e unico por tenant — criar de novo com a mesma
 * chave simplesmente falha silenciosamente (409), sem duplicar a tarefa.
 * Isso e o que evita reprocessar o mesmo CNJ toda vez que a OAB e varrida.
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo_invalido" }, { status: 400 });
  }

  const source = typeof body.source === "string" ? body.source : "";
  const type = typeof body.type === "string" ? body.type.slice(0, 60) : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.slice(0, 200) : "";
  if (!VALID_SOURCES.has(source) || !type || !idempotencyKey) {
    return NextResponse.json({ error: "parametros_invalidos" }, { status: 400 });
  }

  const priority = Number.isFinite(Number(body.priority)) ? Math.min(9, Math.max(1, Math.floor(Number(body.priority)))) : 5;
  const cnj = typeof body.cnj === "string" ? body.cnj.replace(/\D/g, "") : null;
  const parentTaskId = typeof body.parentTaskId === "string" ? body.parentTaskId : null;
  const cursor = body.cursor ?? null;

  const { data: inserted, error } = await supabase
    .from("sync_tasks")
    .insert({
      tenant_id: device.tenantId,
      source,
      type,
      idempotency_key: idempotencyKey,
      priority,
      cnj: cnj && cnj.length === 20 ? cnj : null,
      parent_task_id: parentTaskId,
      cursor,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    // 23505 = unique_violation (tenant_id, idempotency_key) — tarefa ja existe, ignora.
    if (error.code === "23505") return NextResponse.json({ ok: true, created: false });
    console.error("[cs/tasks/create] falha ao criar tarefa:", error);
    return NextResponse.json({ error: "tarefa_nao_criada" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, created: true, taskId: inserted?.id });
}
