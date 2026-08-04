import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Estados que NÃO bloqueiam recriar a tarefa — só o que ainda está "em
 * aberto" conta como já coberto (ver poll-pdpj-detalhes/poll-pdpj-urgentes).
 */
export const STATUS_ABERTOS_PDPJ = [
  "pending",
  "claimed",
  "running",
  "waiting_external",
  "paused_login_required",
  "paused_rate_limit",
] as const;

const PAGE_SIZE = 1000;

/**
 * Busca TODOS os CNJs com tarefa `pdpj_cnj` aberta de um tenant, paginando.
 *
 * Achado 03/08/2026: a versão anterior não paginava — o Supabase/PostgREST
 * limita a 1000 linhas por padrão. Com a fila de tarefas abertas passando
 * de 1000 (CS ficou offline um fim de semana inteiro), a lista de "já tem
 * tarefa aberta" ficava incompleta, e os crons de reescaneio voltavam a
 * criar tarefa nova todo dia pro mesmo CNJ mesmo já tendo uma parada
 * esperando — 121 CNJs chegaram a ter até 4 tarefas abertas simultâneas.
 */
export async function buscarCnjsComTarefaAberta(supabase: SupabaseClient, tenantId: string): Promise<Set<string>> {
  const cnjs = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("sync_tasks")
      .select("cnj")
      .eq("tenant_id", tenantId)
      .eq("source", "pdpj")
      .eq("type", "pdpj_cnj")
      .in("status", STATUS_ABERTOS_PDPJ)
      .not("cnj", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar tarefas pdpj_cnj abertas: ${error.message}`);
    for (const row of data ?? []) {
      if (row.cnj) cnjs.add(row.cnj as string);
    }
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return cnjs;
}

export interface ProcessoCandidato {
  id: string;
  cnj: string;
}

/**
 * Busca processos candidatos a reescaneio (ativo, sem "acesso negado" do
 * PDPJ marcado, nunca sincronizado ou sincronizado há mais que
 * `diasParaReescanear`), paginando — mesma razão da função acima: uma
 * base grande de processos pendentes não pode depender do limite padrão
 * de 1000 linhas do PostgREST. Devolve TODOS os candidatos, ordenados por
 * `ultima_sync_pdpj` (mais antigo primeiro) — quem chama decide quantos
 * pegar (`loteDeHoje`) depois de excluir quem já tem tarefa aberta.
 */
export async function buscarProcessosCandidatosPdpj(
  supabase: SupabaseClient,
  tenantId: string,
  limiteAntiguidadeIso: string,
): Promise<ProcessoCandidato[]> {
  const candidatos: ProcessoCandidato[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("processos")
      .select("id, cnj")
      .eq("tenant_id", tenantId)
      .eq("status", "ativo")
      .is("pdpj_acesso_negado_em", null)
      .or(`ultima_sync_pdpj.is.null,ultima_sync_pdpj.lt.${limiteAntiguidadeIso}`)
      .order("ultima_sync_pdpj", { ascending: true, nullsFirst: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar processos candidatos a reescaneio PDPJ: ${error.message}`);
    for (const row of data ?? []) {
      if (row.cnj) candidatos.push({ id: row.id as string, cnj: row.cnj as string });
    }
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return candidatos;
}

/**
 * Rede de segurança: remove duplicata de tarefa `pdpj_cnj` aberta pro
 * mesmo CNJ (mesmo tenant) — mantém só a de maior prioridade (número
 * menor = mais urgente), desempate pela mais recente. As demais viram
 * `cancelled` (nunca apagadas — mantém rastro de auditoria).
 *
 * Roda a cada disparo dos crons de reescaneio, antes de criar tarefa
 * nova — assim, mesmo que outro bug volte a gerar duplicata no futuro,
 * ela é limpa no próximo ciclo em vez de se acumular pra sempre.
 */
export async function desduplicarTarefasAbertasPdpj(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ cnjsComDuplicata: number; tarefasCanceladas: number }> {
  const porCnj = new Map<string, { id: string; priority: number; created_at: string }[]>();
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("sync_tasks")
      .select("id, cnj, priority, created_at")
      .eq("tenant_id", tenantId)
      .eq("source", "pdpj")
      .eq("type", "pdpj_cnj")
      .in("status", STATUS_ABERTOS_PDPJ)
      .not("cnj", "is", null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`Falha ao buscar tarefas pdpj_cnj abertas pra dedup: ${error.message}`);
    for (const row of data ?? []) {
      const cnj = row.cnj as string;
      const lista = porCnj.get(cnj) ?? [];
      lista.push({ id: row.id as string, priority: row.priority as number, created_at: row.created_at as string });
      porCnj.set(cnj, lista);
    }
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  let cnjsComDuplicata = 0;
  const idsParaCancelar: string[] = [];
  for (const tarefas of porCnj.values()) {
    if (tarefas.length <= 1) continue;
    cnjsComDuplicata += 1;
    const ordenadas = [...tarefas].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
    for (const tarefa of ordenadas.slice(1)) idsParaCancelar.push(tarefa.id);
  }

  if (idsParaCancelar.length === 0) return { cnjsComDuplicata: 0, tarefasCanceladas: 0 };

  const agora = new Date().toISOString();
  const { error: cancelError } = await supabase
    .from("sync_tasks")
    .update({
      status: "cancelled",
      completed_at: agora,
      lease_expires_at: null,
      error_code: "duplicata_removida",
      error_message: "Tarefa duplicada pro mesmo CNJ — mantida só a de maior prioridade/mais recente.",
    })
    .in("id", idsParaCancelar);
  if (cancelError) throw new Error(`Falha ao cancelar tarefas pdpj_cnj duplicadas: ${cancelError.message}`);

  return { cnjsComDuplicata, tarefasCanceladas: idsParaCancelar.length };
}
