import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const VALID_SOURCES = new Set(["datajud", "mural", "pdpj"]);

// Mesma lista usada pelos crons poll-pdpj-detalhes/poll-pdpj-urgentes pra
// decidir se um CNJ já "tem dono" — ver o comentário do filtro abaixo.
const STATUS_ABERTOS = ["pending", "claimed", "running", "waiting_external", "paused_login_required", "paused_rate_limit"];

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
 *
 * Mas a varredura de OAB (aqui) e os crons de reescaneio periodico
 * (poll-pdpj-detalhes/poll-pdpj-urgentes) usam chaves DIFERENTES pro mesmo
 * CNJ — `pdpj_cnj:{cnj}` (sem data, permanente) aqui vs.
 * `pdpj_cnj:{cnj}:{data}` (com a data do dia) nos crons — entao a
 * unique_violation acima nao pega quando as duas fontes tentam criar
 * tarefa pro MESMO CNJ quase ao mesmo tempo (ex.: processo descoberto pela
 * OAB as 12:00, cron de reescaneio roda as 12:05 e ainda nao viu a tarefa
 * da OAB). Os crons ja se protegem disso com uma pre-consulta por CNJs com
 * tarefa aberta; aqui faz a mesma checagem pro lado da OAB (achado
 * 31/07/2026, apos o Caio notar tarefas pdpj_cnj se repetindo na fila).
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
  const cnjValido = cnj && cnj.length === 20 ? cnj : null;
  const parentTaskId = typeof body.parentTaskId === "string" ? body.parentTaskId : null;
  const cursor = body.cursor ?? null;

  if (type === "pdpj_cnj" && cnjValido) {
    const { data: tarefaAberta } = await supabase
      .from("sync_tasks")
      .select("id")
      .eq("tenant_id", device.tenantId)
      .eq("source", "pdpj")
      .eq("type", "pdpj_cnj")
      .eq("cnj", cnjValido)
      .in("status", STATUS_ABERTOS)
      .limit(1)
      .maybeSingle();
    if (tarefaAberta) return NextResponse.json({ ok: true, created: false });
  }

  const { data: inserted, error } = await supabase
    .from("sync_tasks")
    .insert({
      tenant_id: device.tenantId,
      source,
      type,
      idempotency_key: idempotencyKey,
      priority,
      cnj: cnjValido,
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
