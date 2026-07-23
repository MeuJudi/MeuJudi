import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sincronizarProcessoDataJud } from "@/lib/datajud/sincronizar-processo";

const BATCH_SIZE = 3;

export async function POST(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "DATAJUD_API_KEY não configurada" }, { status: 500 });

  const supabase = createServiceClient();
  const { data: job, error: jobError } = await supabase
    .from("datajud_sync_jobs")
    .select("id, tenant_id, status, total, next_offset, updated_count, unchanged_count, not_found_count, error_count")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job) return NextResponse.json({ processed: 0, message: "Nenhum job DataJud pendente." });

  await supabase.from("datajud_sync_jobs").update({ status: "running", started_at: job.status === "pending" ? new Date().toISOString() : undefined, heartbeat_at: new Date().toISOString() }).eq("id", job.id);

  const { data: processes, error: processError } = await supabase
    .from("processos")
    .select("id, cnj, data_ultima_movimentacao, data_ultima_movimentacao_datajud")
    .eq("tenant_id", job.tenant_id)
    .eq("status", "ativo")
    .eq("nivel_sigilo", 0)
    .order("id", { ascending: true })
    .range(job.next_offset, job.next_offset + BATCH_SIZE - 1);
  if (processError) {
    await supabase.from("datajud_sync_jobs").update({ status: "failed", last_error: processError.message, completed_at: new Date().toISOString() }).eq("id", job.id);
    return NextResponse.json({ error: processError.message }, { status: 500 });
  }

  let updated = job.updated_count;
  let unchanged = job.unchanged_count;
  let notFound = job.not_found_count;
  let errors = job.error_count;
  for (const process of processes ?? []) {
    try {
      const result = await sincronizarProcessoDataJud(supabase, job.tenant_id, process, apiKey);
      if (result.status === "atualizado") updated++;
      if (result.status === "sem_mudanca") unchanged++;
      if (result.status === "nao_encontrado") notFound++;
    } catch (error) {
      errors++;
      console.error(`[cron/process-datajud-sync] ${process.cnj}:`, error);
    }
  }

  const processed = job.next_offset + (processes?.length ?? 0);
  const done = (processes?.length ?? 0) < BATCH_SIZE || processed >= job.total;
  await supabase.from("datajud_sync_jobs").update({
    status: done ? "completed" : "running",
    processed,
    next_offset: processed,
    updated_count: updated,
    unchanged_count: unchanged,
    not_found_count: notFound,
    error_count: errors,
    heartbeat_at: new Date().toISOString(),
    completed_at: done ? new Date().toISOString() : null,
  }).eq("id", job.id);

  return NextResponse.json({ job_id: job.id, processed: processes?.length ?? 0, total: job.total, done });
}
