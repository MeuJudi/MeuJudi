import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * POST /api/cs/sync/datajud/trigger
 *
 * Espelha `startTenantDataJudSyncJob` (src/app/(platform)/(tenant)/
 * monitoramento/actions.ts), só que autenticado por device em vez de
 * usuário logado — permite o "Sincronizar agora" do MeuJudi Sync disparar
 * o DataJud também, não só Mural/PDPJ (achado 04/08/2026: DataJud só
 * rodava pelo botão da Web, decisão original de 29/07/2026 era não ter
 * handler de DataJud na fila do CS — continua assim, isso aqui só cria a
 * mesma linha em `datajud_sync_jobs` que o botão da Web cria; quem
 * processa é o cron `process-datajud-sync`, já rodando a cada 1min).
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  if (!process.env.DATAJUD_API_KEY) {
    return NextResponse.json({ error: "datajud_nao_configurado" }, { status: 500 });
  }

  const { data: active } = await supabase
    .from("datajud_sync_jobs")
    .select("id")
    .eq("tenant_id", device.tenantId)
    .in("status", ["pending", "running"])
    .maybeSingle();
  if (active?.id) return NextResponse.json({ ok: true, jobId: active.id, resumed: true });

  const { getProcessIdsForTenant } = await import("@/lib/processos/helpers");
  const processoIds = await getProcessIdsForTenant(supabase, device.tenantId);
  const { count, error: countError } = processoIds.length === 0
    ? { count: 0, error: null }
    : await supabase
      .from("processos")
      .select("id", { count: "exact", head: true })
      .in("id", processoIds)
      .eq("status", "ativo")
      .eq("nivel_sigilo", 0);
  if (countError) {
    console.error("[cs/sync/datajud/trigger] falha ao contar processos:", countError.message);
    return NextResponse.json({ error: "falha_ao_contar_processos" }, { status: 500 });
  }

  const { data: job, error } = await supabase
    .from("datajud_sync_jobs")
    .insert({ tenant_id: device.tenantId, requested_by: null, total: count ?? 0 })
    .select("id")
    .single();
  if (error || !job) {
    console.error("[cs/sync/datajud/trigger] falha ao criar job:", error?.message);
    return NextResponse.json({ error: "job_nao_criado" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jobId: job.id, resumed: false });
}
