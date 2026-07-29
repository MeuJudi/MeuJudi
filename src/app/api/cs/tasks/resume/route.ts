import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * POST /api/cs/tasks/resume
 *
 * Destrava tarefas paradas em `paused_login_required` ou `paused_rate_limit`
 * do tenant do device, devolvendo pra `pending` — sem isso elas nunca
 * voltam a ser escolhidas pelo `claim` (que só considera `pending` ou lease
 * expirado, ver /api/cs/tasks/claim/route.ts), mesmo depois do login/API
 * ser revalidado com sucesso. `paused_rate_limit` entra aqui também porque,
 * na prática, boa parte dessas pausas eram na verdade sessão/rede — se a
 * API acabou de ser validada com sucesso, vale a pena tentar de novo.
 * Chamado pelo CS (`pdpj-auth.ts::doEnsureApiSession`) assim que o Bearer é
 * capturado de novo.
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { data, error } = await supabase
    .from("sync_tasks")
    .update({ status: "pending", last_activity_at: new Date().toISOString() })
    .eq("tenant_id", device.tenantId)
    .in("status", ["paused_login_required", "paused_rate_limit"])
    .select("id");

  if (error) {
    console.error("[cs/tasks/resume] falha ao destravar tarefas:", error);
    return NextResponse.json({ error: "tarefas_nao_destravadas" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, resumed: data?.length ?? 0 });
}
