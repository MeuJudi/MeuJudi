import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * GET /api/cs/tasks/pending-count?source=pdpj
 *
 * Conta quantas tarefas do tenant estão em `pending` agora — diferente do
 * que `StatusReporter.setPendingTasks()` já reporta (que é só o que o
 * próprio device tem em andamento no momento, não o backlog real
 * aguardando na fila). Usado pelo CS pra alertar quando a fila cresce sem
 * cair, mesmo com a sessão do PDPJ saudável (achado 14/08/2026: fila com
 * 327 tarefas presas sem nenhum aviso, porque a sessão em si estava ok).
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const source = request.nextUrl.searchParams.get("source");
  const allowedSources = ["datajud", "mural", "pdpj"];
  if (source && !allowedSources.includes(source)) {
    return NextResponse.json({ error: "source_invalido" }, { status: 400 });
  }

  let query = supabase
    .from("sync_tasks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", device.tenantId)
    .eq("status", "pending");
  if (source) query = query.eq("source", source);

  const { count, error } = await query;
  if (error) {
    console.error("[cs/tasks/pending-count] falha ao contar:", error);
    return NextResponse.json({ error: "contagem_indisponivel" }, { status: 500 });
  }

  return NextResponse.json({ pendingCount: count ?? 0 });
}
