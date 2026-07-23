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
    })
    .select("id, status")
    .single();

  if (error || !criada) throw new Error(`Não foi possível criar a solicitação: ${error?.message ?? "erro desconhecido"}`);

  revalidatePath("/validacao-oab");
  return { id: criada.id as string, status: criada.status as string };
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
