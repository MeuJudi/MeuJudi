import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * GET /api/cs/tasks
 *
 * Lista as tarefas recentes do tenant do device autenticado — usado pela
 * tela de fila do MeuJudi Sync (/queue). Somente leitura, não reserva nada.
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const status = request.nextUrl.searchParams.get("status");

  let query = supabase
    .from("sync_tasks")
    .select("id, parent_task_id, source, type, cnj, status, priority, attempt, cursor, error_message, started_at, last_activity_at, completed_at, created_at")
    .eq("tenant_id", device.tenantId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data: tasks, error } = await query;
  if (error) {
    console.error("[cs/tasks] falha ao listar tarefas:", error);
    return NextResponse.json({ error: "fila_indisponivel" }, { status: 500 });
  }

  return NextResponse.json({ tasks: tasks ?? [] });
}
