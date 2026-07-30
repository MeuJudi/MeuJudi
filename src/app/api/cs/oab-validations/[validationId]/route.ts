// Fase 3 (módulo CS) — reporta progresso/resultado de uma validação de OAB
// em andamento no MeuJudi Sync. Uma rota genérica pro ciclo de vida inteiro
// (diferente de mural-requests/[requestId], que só tem "completou ou
// falhou") porque o fluxo do ConfirmADV tem vários passos intermediários
// visíveis pro usuário (recaptcha, aguardando código, validando).

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const EVENT_STATUS_MAP: Record<string, string | undefined> = {
  cs_received: "aguardando_cs",
  browser_opened: "recaptcha_em_andamento",
  captcha_completed: undefined,
  request_created: "aguardando_codigo",
  code_pending: undefined,
  verified: "validada",
  rejected: "recusada",
  expired: "expirada",
  failed: "erro",
  cancelled: "cancelada",
};

// Único status de OAB aceito automaticamente. Só confirmamos "REGULAR" —
// qualquer outra coisa (suspensa, cancelada, licenciada, ou um valor que a
// gente ainda não viu) é recusada por padrão. Mais seguro exigir uma
// atualização explícita aqui do que aceitar um valor desconhecido.
const STATUS_OAB_ACEITOS = new Set(["REGULAR"]);

/** Remove acento/caixa/espaço duplicado pra comparar nome — mesmo idioma de src/lib/regex/patterns.ts. */
function normalizarNome(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compara o nome que o ConfirmADV devolveu (dono real da OAB) com o nome
 * cadastrado da conta MeuJudi que está fazendo a validação — não com
 * `requester_name` do formulário (esse campo é só "quem está pedindo",
 * pode ser um secretário pedindo pela OAB de outra pessoa; ver
 * docs/roadmap/validacao-oab-confirmadv-cs.md). Tolerante o bastante pra
 * não recusar por causa de nome do meio faltando: todo termo do nome mais
 * curto precisa aparecer no nome mais longo.
 */
function nomesCompativeis(nomeConta: string, nomeRetornado: string): boolean {
  const a = normalizarNome(nomeConta);
  const b = normalizarNome(nomeRetornado);
  if (!a || !b) return false;
  const termosA = a.split(" ").filter(Boolean);
  const termosB = b.split(" ").filter(Boolean);
  const [menor, maior] = termosA.length <= termosB.length ? [termosA, termosB] : [termosB, termosA];
  if (menor.length === 0) return false;
  return menor.every((termo) => maior.includes(termo));
}

const ALLOWED_EVENTS = Object.keys(EVENT_STATUS_MAP);
const VALID_STATUSES = [
  "pendente", "aguardando_cs", "recaptcha_em_andamento", "aguardando_codigo",
  "validando", "validada", "recusada", "expirada", "erro", "cancelada",
];
// Estados terminais nunca são reabertos — impede que um bug ou uma resposta
// atrasada do CS sobrescreva um resultado já fechado (ex.: chegar 'verified'
// depois que a solicitação já expirou).
const TERMINAL = ["validada", "recusada", "expirada", "cancelada"];

interface ReportBody {
  event_type?: string;
  status?: string;
  message?: string;
  external_request_id?: string;
  result?: {
    returned_name?: string;
    returned_status?: string;
    returned_email?: string;
    is_validation?: boolean;
    expires_at?: string;
  };
}

export async function POST(request: NextRequest, context: { params: Promise<{ validationId: string }> }) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { validationId } = await context.params;
  const body = await request.json().catch(() => ({})) as ReportBody;
  if (!body.event_type || !ALLOWED_EVENTS.includes(body.event_type)) {
    return NextResponse.json({ error: "evento_invalido" }, { status: 400 });
  }

  const { data: current, error: currentError } = await supabase
    .from("oab_validations")
    .select("status, tenant_id, user_id, oab_number, oab_uf, users!oab_validations_user_id_fkey(name)")
    .eq("id", validationId)
    .eq("tenant_id", device.tenantId)
    .eq("user_id", device.userId)
    .maybeSingle<{
      status: string;
      tenant_id: string;
      user_id: string;
      oab_number: string;
      oab_uf: string;
      users: { name: string } | null;
    }>();
  if (currentError) return NextResponse.json({ error: "solicitacao_nao_carregada" }, { status: 500 });
  if (!current) return NextResponse.json({ error: "solicitacao_nao_encontrada" }, { status: 404 });

  // Sempre grava o evento de auditoria, mesmo quando o status não pode
  // avançar (ex.: solicitação já terminal).
  await supabase.from("oab_validation_events").insert({
    validation_id: validationId,
    event_type: body.event_type,
    message: body.message ? String(body.message).slice(0, 500) : null,
  });

  if (TERMINAL.includes(current.status)) {
    return NextResponse.json({ ok: true, status: current.status });
  }

  let nextStatus = body.status && VALID_STATUSES.includes(body.status) ? body.status : EVENT_STATUS_MAP[body.event_type];
  const update: Record<string, unknown> = {};
  if (body.external_request_id) update.external_request_id = body.external_request_id;

  // W8 — auditoria: log explícito quando o evento foi aceito mas não
  // muda o status. Acontece com `captcha_completed` e `code_pending` por
  // design — eles só marcam a auditoria sem avançar o status. Sem o log
  // é difícil entender por que o `oab_validations.status` não mudou
  // quando o evento foi "aceito" (passou pelo ALLOWED_EVENTS).
  if (!nextStatus) {
    console.info(`[cs/oab-validations] Evento '${body.event_type}' registrado sem mudança de status (intermediário)`);
  }

  // O CS nunca decide sozinho se o resultado vale — ele só relata o que o
  // ConfirmADV devolveu (ver comentário no CS: "o sistema nunca deve
  // confiar em dado enviado pelo cliente"). Aqui é onde de fato se decide
  // aceitar: nome bate com o dono da conta MeuJudi e a OAB está regular.
  let validacaoAceita = false;
  if (body.event_type === "verified") {
    update.returned_name = body.result?.returned_name ?? null;
    update.returned_status = body.result?.returned_status ?? null;
    update.returned_email = body.result?.returned_email ?? null;
    update.is_validation = body.result?.is_validation ?? true;
    update.verified_at = new Date().toISOString();
    if (body.result?.expires_at) update.expires_at = body.result.expires_at;

    const nomeConta = current.users?.name ?? "";
    const nomeRetornado = body.result?.returned_name ?? "";
    const statusRetornado = (body.result?.returned_status ?? "").toUpperCase();
    const nomeBate = nomesCompativeis(nomeConta, nomeRetornado);
    const statusOk = STATUS_OAB_ACEITOS.has(statusRetornado);
    validacaoAceita = nomeBate && statusOk;

    if (!validacaoAceita) {
      console.warn("[cs/oab-validations] verificação recusada — nome ou status não bateram", {
        validationId,
        nomeBate,
        statusOk,
        statusRetornado: statusRetornado || null,
      });
      nextStatus = "recusada";
      update.last_error = "Não foi possível confirmar essa OAB para esta conta. Confira os dados e tente novamente.";
    }
  }
  if (body.event_type === "rejected") {
    update.returned_status = body.result?.returned_status ?? null;
    update.verified_at = new Date().toISOString();
  }
  if (body.event_type === "failed") {
    update.last_error = body.message?.slice(0, 500) || "Ocorreu um erro técnico durante a verificação.";
  }
  if (nextStatus) update.status = nextStatus;

  // Grava o resultado ANTES de chamar o RPC de liberação. Antes, essa
  // gravação vinha depois do RPC e era pulada de vez (return early) se
  // o RPC falhasse — ou seja, uma falha transitória no RPC perdia
  // nome/status retornados e a validação ficava presa no status
  // anterior (sem chegar a "validada" nem "erro"), até o timeout de
  // inatividade marcar como "expirada" mesmo a pessoa tendo confirmado.
  // Gravar antes garante que o resultado fica registrado mesmo se a
  // liberação da fonte falhar.
  if (Object.keys(update).length > 0) {
    await supabase
      .from("oab_validations")
      .update(update)
      .eq("id", validationId)
      .eq("tenant_id", device.tenantId)
      .eq("user_id", device.userId);
  }

  // Fase 4 — quando o resultado é positivo (nome + status conferidos
  // acima), liberamos a fonte. C2 da auditoria: os dois updates
  // (users.oab_validated_at + tenants.access_status) são feitos
  // atomicamente via RPC para evitar estado inconsistente em caso de
  // falha parcial. O `service_role` é necessário porque a função é
  // SECURITY DEFINER; o CS já foi autenticado pelo `autenticarDevice` e o
  // escopo (tenant_id, user_id) foi validado acima no select do `current`.
  if (body.event_type === "verified" && validacaoAceita) {
    const { error: rpcError } = await supabase.rpc("finalize_oab_validation", {
      p_user_id: current.user_id,
      p_tenant_id: current.tenant_id,
      p_oab_number: current.oab_number,
      p_oab_uf: current.oab_uf,
    });
    if (rpcError) {
      // O resultado já foi gravado acima (status "validada" +
      // returned_name/status) — essa falha é só na liberação da fonte.
      // Log e retorna 500 para o cliente saber que algo deu errado.
      console.error("[cs/oab-validations] finalize_oab_validation falhou:", rpcError);
      return NextResponse.json(
        { error: "finalizacao_falhou", details: rpcError.message },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ ok: true, status: nextStatus ?? current.status });
}
