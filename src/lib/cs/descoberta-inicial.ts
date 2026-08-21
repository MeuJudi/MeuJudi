import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Dispara a descoberta inicial (PDPJ + Mural) pra uma OAB assim que ela
 * fica elegível de verdade — no lugar de esperar o próximo balde de 6h
 * dos crons `solicitar-pdpj`/`solicitar-mural`. Ver docs/roadmap/
 * 30-auditoria-descoberta-inicial-processos.md, seção 5.
 *
 * Cria exatamente as MESMAS tarefas que os crons criariam (mesmo
 * `idempotency_key`, mesmo formato de `cursor`) — só com prioridade mais
 * alta (1, os crons usam 5) pra esses itens serem reservados pelo CS
 * antes de qualquer outra coisa da fila desse tenant. Como a prioridade
 * só ordena dentro da fila do PRÓPRIO tenant (a rota de claim já filtra
 * por `tenant_id` do device autenticado), isso nunca compete com a fila
 * de outro escritório.
 *
 * Silenciosamente não faz nada se o tenant ainda não estiver
 * `access_status = 'liberado'` (mesmo portão que os crons já respeitam) —
 * nesse caso os crons pegam assim que o tenant for liberado, mais tarde.
 * Tolera 23505 (tarefa já existe) sem erro — é exatamente o mesmo cenário
 * de corrida que os crons já toleram.
 */
export async function dispararDescobertaInicial(tenantId: string, oabNumber: string, oabUf: string): Promise<void> {
  const supabase = createServiceClient();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("is_active, access_status")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.is_active || tenant.access_status !== "liberado") return;

  const batchId = randomUUID();

  await inserirTarefaPdpjOab(supabase, tenantId, oabNumber, oabUf, batchId);
  await inserirTarefaMuralRequest(supabase, tenantId, oabNumber, oabUf, batchId);
}

/** Mesmo balde de 6h alinhado à meia-noite UTC usado por `api/cron/solicitar-pdpj`. */
function baldeSeisHoras(data: Date): string {
  const hora = Math.floor(data.getUTCHours() / 6) * 6;
  const dia = data.toISOString().slice(0, 10);
  return `${dia}T${String(hora).padStart(2, "0")}`;
}

async function inserirTarefaPdpjOab(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  oabNumber: string,
  oabUf: string,
  batchId: string,
): Promise<void> {
  const balde = baldeSeisHoras(new Date());
  const { error } = await supabase.from("sync_tasks").insert({
    tenant_id: tenantId,
    source: "pdpj",
    type: "pdpj_oab",
    idempotency_key: `pdpj_oab:${oabNumber}:${oabUf}:${balde}`,
    priority: 1,
    cursor: { oabNumber, oabUf },
    batch_id: batchId,
  });
  if (error && error.code !== "23505") {
    console.error(`[descoberta-inicial] falha ao criar pdpj_oab pra ${oabNumber}/${oabUf}:`, error.message);
  }
}

const JANELA_PADRAO_DIAS = 30;

async function inserirTarefaMuralRequest(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  oabNumber: string,
  oabUf: string,
  batchId: string,
): Promise<void> {
  const now = new Date();
  const dataInicio = new Date(now.getTime() - JANELA_PADRAO_DIAS * 24 * 60 * 60 * 1000);
  const dataInicioStr = dataInicio.toISOString().split("T")[0];
  const dataFimStr = now.toISOString().split("T")[0];

  const { error } = await supabase.from("sync_tasks").insert({
    tenant_id: tenantId,
    source: "mural",
    type: "mural_request",
    idempotency_key: `mural_request:${oabNumber}:${oabUf}:${dataInicioStr}`,
    priority: 1,
    cursor: { oabNumber, oabUf, dataInicio: dataInicioStr, dataFim: dataFimStr },
    batch_id: batchId,
  });
  if (error && error.code !== "23505") {
    console.error(`[descoberta-inicial] falha ao criar mural_request pra ${oabNumber}/${oabUf}:`, error.message);
  }
}
