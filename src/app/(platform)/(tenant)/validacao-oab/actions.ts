"use server";

// Fase 2 (tela Web) da validação de OAB via ConfirmADV — ver
// docs/roadmap/validacao-oab-confirmadv-cs.md. Usa requireWritableAppUser
// (não o gate requireTenantDataAccess) porque esta própria tela precisa
// ficar acessível mesmo com o tenant bloqueado.

import { revalidatePath } from "next/cache";
import { requireWritableAppUser, requireAppUser } from "@/lib/auth/guards";
import { stripMask } from "@/lib/masks";

const STATUS_ATIVOS = [
  "pendente",
  "aguardando_cs",
  "recaptcha_em_andamento",
  "aguardando_codigo",
  "validando",
] as const;

const STATUS_TERMINAIS_NEGATIVOS = [
  "recusada",
  "expirada",
  "erro",
  "cancelada",
] as const;

// W1 — auditoria: rate limit por usuário. Após MAX_TENTATIVAS_RECENTES
// tentativas em JANELA_MINUTOS, bloqueia novas solicitações por
// COOLDOWN_MINUTOS minutos. Isso protege contra advogados em loop
// fechando a janela sem parar (cada fechamento vira uma nova tentativa).
const MAX_TENTATIVAS_RECENTES = 5;
const JANELA_MINUTOS = 60;
const COOLDOWN_MINUTOS = 30;

export async function criarOuRetomarSolicitacaoValidacao(formData: FormData) {
  const { supabase, profile } = await requireWritableAppUser();
  if (!profile.tenant_id) throw new Error("Usuário sem escritório vinculado.");

  const oabNumber = stripMask(String(formData.get("oab_number") ?? ""));
  const oabUf = String(formData.get("oab_uf") ?? "").trim().toUpperCase();
  const professionalEmail = String(formData.get("professional_email") ?? "").trim();
  const requesterName = String(formData.get("requester_name") ?? "").trim();

  if (!oabNumber) throw new Error("Informe o número da OAB.");
  if (!/^[A-Z]{2}$/.test(oabUf)) throw new Error("Informe a UF da OAB (2 letras).");
  if (!professionalEmail.includes("@")) throw new Error("Informe o e-mail profissional cadastrado na OAB.");
  if (!requesterName) throw new Error("Informe o nome do solicitante.");

  // Já existe ativa? Retorna ela sem criar nova.
  const { data: existente } = await supabase
    .from("oab_validations")
    .select("id, status")
    .eq("user_id", profile.id)
    .in("status", STATUS_ATIVOS)
    .order("created_at", { ascending: false })
    .maybeSingle();

  if (existente) {
    revalidatePath("/validacao-oab");
    return { id: existente.id as string, status: existente.status as string };
  }

  // W1: rate limit — conta quantas tentativas em estado terminal
  // negativo esse usuário teve na última hora. Se excedeu o limite,
  // bloqueia por cooldown.
  const janelaInicio = new Date(Date.now() - JANELA_MINUTOS * 60 * 1000).toISOString();
  const { count: tentativasRecentes, error: countError } = await supabase
    .from("oab_validations")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .in("status", STATUS_TERMINAIS_NEGATIVOS)
    .gte("created_at", janelaInicio);

  if (countError) {
    // Se a contagem falhar (RLS, etc.), segue em frente — o índice
    // partial unique já impede duplicatas ativas.
    console.warn("[validacao-oab] Nao foi possivel contar tentativas recentes:", countError.message);
  } else if ((tentativasRecentes ?? 0) >= MAX_TENTATIVAS_RECENTES) {
    // Calcula quando o usuário pode tentar de novo (= criação da
    // tentativa mais recente + cooldown).
    const { data: ultimaNegativa } = await supabase
      .from("oab_validations")
      .select("created_at")
      .eq("user_id", profile.id)
      .in("status", STATUS_TERMINAIS_NEGATIVOS)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tentaEm = ultimaNegativa
      ? new Date(new Date(ultimaNegativa.created_at).getTime() + COOLDOWN_MINUTOS * 60 * 1000)
      : new Date(Date.now() + COOLDOWN_MINUTOS * 60 * 1000);
    const minutosRestantes = Math.max(1, Math.ceil((tentaEm.getTime() - Date.now()) / 60_000));

    throw new Error(
      `Muitas tentativas recentes. Aguarde ${minutosRestantes} minuto(s) antes de tentar de novo.`,
    );
  }

  // Cria a nova solicitação com attempt_count = (recentes + 1).
  // Assim o campo `attempt_count` deixa de ser decorativo e mostra
  // a posição desta tentativa na sequência recente.
  const attemptCount = (tentativasRecentes ?? 0) + 1;
  const { data: criada, error } = await supabase
    .from("oab_validations")
    .insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      oab_number: oabNumber,
      oab_uf: oabUf,
      professional_email: professionalEmail,
      requester_name: requesterName,
      status: "pendente",
      attempt_count: attemptCount,
    })
    .select("id, status")
    .single();

  if (error || !criada) throw new Error(`Não foi possível criar a solicitação: ${error?.message ?? "erro desconhecido"}`);

  revalidatePath("/validacao-oab");
  return { id: criada.id as string, status: criada.status as string, attemptCount };
}

export async function cancelarSolicitacaoValidacao(validationId: string) {
  const { supabase, profile } = await requireWritableAppUser();
  if (!profile.tenant_id) throw new Error("Usuário sem escritório vinculado.");

  const { error } = await supabase
    .from("oab_validations")
    .update({ status: "cancelada" })
    .eq("id", validationId)
    .eq("user_id", profile.id)
    .eq("tenant_id", profile.tenant_id);

  if (error) throw new Error(`Não foi possível cancelar a solicitação: ${error.message}`);

  revalidatePath("/validacao-oab");
  return { ok: true as const };
}

export async function getStatusSolicitacaoValidacao(validationId: string) {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };

  const { data, error } = await supabase
    .from("oab_validations")
    .select("id, status, last_error, verified_at")
    .eq("id", validationId)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();

  if (error) return { ok: false as const, message: error.message };
  if (!data) return { ok: false as const, message: "Solicitação não encontrada." };

  return {
    ok: true as const,
    status: data.status as string,
    lastError: data.last_error as string | null,
    verifiedAt: data.verified_at as string | null,
  };
}
