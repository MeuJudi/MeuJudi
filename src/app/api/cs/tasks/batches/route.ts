import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

export interface TaskBatch {
  batch_key: string;
  source: string;
  type: string;
  total: number;
  done: number;
  failed: number;
  paused: number;
  created_at: string;
}

/**
 * GET /api/cs/tasks/batches
 *
 * Resumo agregado da fila por "lote" — usado pela tela "Fila de tarefas"
 * do MeuJudi Sync pra mostrar progresso de uma execução de cron inteira
 * (ex.: 559 tarefas pdpj_cnj de um poll-pdpj-detalhes) sem listar cada
 * linha. Chave do lote é `coalesce(batch_id, parent_task_id, id)` — cobre
 * tarefas criadas juntas por um cron (batch_id) e tarefas-filha de
 * pdpj_oab (parent_task_id) com o mesmo mecanismo; tarefa avulsa vira um
 * "lote de 1" (a própria id).
 */
export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { data, error } = await supabase.rpc("sync_tasks_batches", { p_tenant_id: device.tenantId });
  if (error) {
    console.error("[cs/tasks/batches] falha ao agregar lotes:", error);
    return NextResponse.json({ error: "fila_indisponivel" }, { status: 500 });
  }

  return NextResponse.json({ batches: (data ?? []) as TaskBatch[] });
}
