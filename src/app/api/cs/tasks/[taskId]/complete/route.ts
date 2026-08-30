import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const TERMINAL_OR_PAUSED = [
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
  "paused_login_required",
  "paused_rate_limit",
] as const;

type FinalStatus = (typeof TERMINAL_OR_PAUSED)[number];

// Teto de tentativas antes de uma tarefa que insiste em pausar (login/rate
// limit) virar falha definitiva em vez de pausar de novo — achado
// 31/07/2026: `resumePausedTasks` (chamado pelo CS toda vez que revalida a
// API) destrava TODAS as tarefas pausadas do tenant, sem limite nenhum;
// combinado com uma causa de pausa que se repete, uma tarefa conseguia
// chegar na tentativa 139 seguida, monopolizando as vagas de execução PDPJ
// (SOURCE_CONCURRENCY=2) e travando o resto da fila.
//
// Trabalha junto com o backoff de `resume/route.ts` (ESPERA_MINUTOS_POR_BLOCO):
// 5 blocos de 2 tentativas, espera crescente entre blocos — na 10ª
// tentativa (fim do 5º bloco), se ainda estiver pausando, vira falha
// definitiva aqui. Isso é uma rede de segurança geral — não depende de
// identificar a causa raiz de cada pausa.
const MAX_TENTATIVAS_ANTES_DE_FALHAR = 10;

/**
 * POST /api/cs/tasks/{taskId}/complete
 *
 * Fecha (ou pausa) uma tarefa reservada por este device. Body:
 * { status, cursor?, counters?, errorCode?, errorMessage? }
 *
 * Pausar com paused_login_required/paused_rate_limit não é terminal — a
 * tarefa fica fora da fila de claim (lease_expires_at null) até alguém
 * criar uma nova rodada; isso evita retry em loop quando a causa raiz
 * (sessão expirada, rate limit) ainda não foi resolvida. Mas depois de
 * `MAX_TENTATIVAS_ANTES_DE_FALHAR` pausas seguidas sem nunca completar,
 * vira falha definitiva — ver comentário da constante acima.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ taskId: string }> }) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { taskId } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo_invalido" }, { status: 400 });
  }

  let status = typeof body.status === "string" ? body.status : "";
  if (!TERMINAL_OR_PAUSED.includes(status as FinalStatus)) {
    return NextResponse.json({ error: "status_invalido" }, { status: 400 });
  }

  const now = new Date().toISOString();
  let excedeuTentativas = false;
  const { data: atual } = await supabase
    .from("sync_tasks")
    .select("attempt, processo_id")
    .eq("id", taskId)
    .eq("tenant_id", device.tenantId)
    .maybeSingle();
  if (status === "paused_login_required" || status === "paused_rate_limit") {
    if (atual && (atual.attempt ?? 0) >= MAX_TENTATIVAS_ANTES_DE_FALHAR) {
      excedeuTentativas = true;
      status = "failed";
    }
  }

  // Roteamento por OAB restritiva (docs/roadmap/
  // 26-pdpj-concorrencia-inteligente.md Parte C): PDPJ recusou acesso a ESSE
  // processo especifico (Bearer valido, ver isAcessoNegadoProcessoEspecifico
  // no CS). Antes de deixar a tarefa morrer como `failed`, checa se alguma
  // OAB validada do escritório tem acesso a este processo — se tiver, a
  // tarefa volta pra `pending`, mas só o device do dono dessa OAB consegue
  // reivindicar de novo (ver filtro required_user_id em claim/route.ts).
  let roteamentoOab: { userId: string; oabNumber: string; oabUf: string } | null = null;
  if (status === "failed" && body.errorCode === "sem_acesso_pdpj" && atual?.processo_id) {
    roteamentoOab = await encontrarDonoDeOabComAcesso(supabase, device.tenantId, atual.processo_id);
    if (roteamentoOab) status = "pending";
  }

  const isTerminal = status === "completed" || status === "completed_with_warnings" || status === "failed" || status === "cancelled";

  const update: Record<string, unknown> = {
    status,
    lease_expires_at: null,
    last_activity_at: now,
  };
  if (isTerminal) update.completed_at = now;
  if (body.cursor !== undefined) update.cursor = body.cursor;
  if (body.counters !== undefined) update.counters = body.counters;
  if (status === "completed" || status === "completed_with_warnings") {
    // Uma tentativa anterior pode ter deixado error_code/error_message
    // gravados (achado em log real, 29/07/2026: a tarefa completava com
    // sucesso mas a UI continuava mostrando o erro da tentativa passada,
    // porque esses campos só eram atualizados quando explicitamente
    // enviados no corpo — sucesso nunca envia, então nunca limpava).
    update.error_code = null;
    update.error_message = null;
  } else if (roteamentoOab) {
    update.error_code = "aguardando_oab_especifica";
    update.error_message = `Só a OAB ${roteamentoOab.oabNumber}/${roteamentoOab.oabUf} tem acesso a este processo — aguardando o dispositivo daquela conta processar.`;
  } else if (excedeuTentativas) {
    update.error_code = "excesso_tentativas";
    update.error_message = `Pausou repetidamente (${body.errorCode ?? "motivo desconhecido"}) sem resolver — parou após ${MAX_TENTATIVAS_ANTES_DE_FALHAR} tentativas seguidas.`;
  } else {
    if (body.errorCode !== undefined) update.error_code = String(body.errorCode).slice(0, 60);
    if (body.errorMessage !== undefined) update.error_message = String(body.errorMessage).slice(0, 500);
  }
  // required_* só faz sentido enquanto a tarefa está esperando o dono certo
  // — some assim que ela sai desse estado (sucesso, falha normal, ou já foi
  // reivindicada e vai rodar de novo).
  update.required_user_id = roteamentoOab?.userId ?? null;
  update.required_oab_number = roteamentoOab?.oabNumber ?? null;
  update.required_oab_uf = roteamentoOab?.oabUf ?? null;

  const { data: updated, error } = await supabase
    .from("sync_tasks")
    .update(update)
    .eq("id", taskId)
    .eq("tenant_id", device.tenantId)
    .eq("device_id", device.deviceId)
    .in("status", ["claimed", "running"])
    .select("id, status, processo_id")
    .maybeSingle();

  if (error) {
    console.error("[cs/tasks/complete] falha ao finalizar tarefa:", error);
    return NextResponse.json({ error: "conclusao_nao_registrada" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "tarefa_nao_reservada_por_este_device" }, { status: 409 });

  // Ninguém no escritório tem uma OAB validada com acesso a este processo —
  // marca pra poll-pdpj-detalhes/poll-pdpj-urgentes pararem de recriar
  // tarefa pra ele pra sempre. Só marca aqui (falha definitiva mesmo), não
  // quando foi roteado pra uma OAB específica (aí ainda pode dar certo).
  if (status === "failed" && body.errorCode === "sem_acesso_pdpj" && !roteamentoOab && updated.processo_id) {
    const { error: processoError } = await supabase
      .from("processos")
      .update({ pdpj_acesso_negado_em: now })
      .eq("id", updated.processo_id);
    if (processoError) console.error("[cs/tasks/complete] falha ao marcar processo sem acesso PDPJ:", processoError);
  }

  return NextResponse.json({ ok: true, status: updated.status });
}

/**
 * Cruza processos.advogados (OABs listadas naquele processo, vindas do
 * DataJud/PDPJ) com oab_validations (OABs validadas e pareadas a um user_id
 * deste tenant) — devolve a primeira OAB validada que aparece no processo,
 * ou null se nenhuma OAB do processo está validada no escritório.
 */
async function encontrarDonoDeOabComAcesso(
  supabase: ReturnType<typeof createServiceClient>,
  tenantId: string,
  processoId: string,
): Promise<{ userId: string; oabNumber: string; oabUf: string } | null> {
  const { data: processo } = await supabase
    .from("processos")
    .select("advogados")
    .eq("id", processoId)
    .maybeSingle();
  const advogados = Array.isArray(processo?.advogados) ? (processo.advogados as Array<{ oab?: string; uf?: string }>) : [];
  if (advogados.length === 0) return null;

  const normalizarNumero = (v: string | undefined) => (v ?? "").replace(/\D/g, "");
  const normalizarUf = (v: string | undefined) => (v ?? "").trim().toUpperCase();

  const { data: validadas } = await supabase
    .from("oab_validations")
    .select("user_id, oab_number, oab_uf")
    .eq("tenant_id", tenantId)
    .eq("status", "validada");
  if (!validadas || validadas.length === 0) return null;

  for (const adv of advogados) {
    const numeroAdv = normalizarNumero(adv.oab);
    const ufAdv = normalizarUf(adv.uf);
    if (!numeroAdv || !ufAdv) continue;
    const match = validadas.find((v) => normalizarNumero(v.oab_number) === numeroAdv && normalizarUf(v.oab_uf) === ufAdv);
    if (match) return { userId: match.user_id, oabNumber: match.oab_number, oabUf: match.oab_uf };
  }
  return null;
}
