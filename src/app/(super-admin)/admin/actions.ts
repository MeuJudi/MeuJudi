"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/service";
import { IMPERSONATE_USER_COOKIE } from "@/lib/supabase/auth-scope";
import { dispararDescobertaInicial } from "@/lib/cs/descoberta-inicial";

const IMPERSONATE_COOKIE_MAX_AGE = 60 * 60 * 2; // 2h — sessão de suporte não fica aberta pra sempre.

/**
 * Entra como uma pessoa específica de um tenant — acesso completo (não
 * somente-leitura), pensado pra suporte resolver um problema no lugar do
 * cliente (ex.: reproduzir um bug que só acontece pra aquele usuário).
 * `authUser` continua sendo o Super Admin de verdade; só `profile`
 * (ver requireAppUser em src/lib/auth/guards.ts) passa a ser da pessoa
 * impersonada — por isso toda tela existente funciona automaticamente,
 * sem precisar tratar "modo suporte" caso a caso.
 */
async function setImpersonationCookie(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATE_COOKIE_MAX_AGE,
  });
}

export async function impersonateUser(formData: FormData) {
  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) throw new Error("user_id obrigatorio");

  const { supabase } = await requireSuperAdmin();
  const { data: target, error } = await supabase
    .from("users")
    .select("id, name, tenant_id, is_active")
    .eq("id", userId)
    .single();

  if (error || !target) throw new Error("Usuário não encontrado.");
  if (!target.is_active) throw new Error("Usuário está desativado.");
  if (!target.tenant_id) throw new Error("Usuário sem escritório vinculado.");

  await setImpersonationCookie(userId);

  await supabase.rpc("write_audit_log", {
    p_action: "admin.impersonation_started",
    p_entity: "users",
    p_entity_id: userId,
    p_tenant_id: target.tenant_id,
    p_category: "admin",
    p_metadata: { user_name: target.name },
  });

  redirect("/monitoramento");
}

/** Atalho pra "entrar como" o owner do escritório, direto da tela do tenant. */
export async function enterTenantAsOwner(formData: FormData) {
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) throw new Error("tenant_id obrigatorio");

  const { supabase } = await requireSuperAdmin();
  const { data: owner, error } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "owner")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !owner) throw new Error("Nenhum owner ativo encontrado neste escritório.");

  const impersonateFormData = new FormData();
  impersonateFormData.set("user_id", owner.id);
  await impersonateUser(impersonateFormData);
}

export async function exitImpersonation() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_USER_COOKIE);
  redirect("/admin/tenants");
}

export async function setTenantStatus(formData: FormData) {
  const tenantId = String(formData.get("tenant_id") ?? "");
  const isActive = String(formData.get("is_active")) === "true";
  const { supabase } = await requireSuperAdmin();

  if (!tenantId) {
    throw new Error("tenant_id obrigatorio");
  }

  const { error } = await supabase
    .from("tenants")
    .update({ is_active: isActive })
    .eq("id", tenantId);

  if (error) {
    throw new Error(error.message);
  }

  await supabase.rpc("write_audit_log", {
    p_action: isActive ? "tenant.activated" : "tenant.suspended",
    p_entity: "tenants",
    p_entity_id: tenantId,
    p_tenant_id: tenantId,
    p_category: "admin",
  });

  revalidatePath("/admin");
  revalidatePath("/admin/tenants");
  revalidatePath(`/admin/tenants/${tenantId}`);
}

// [removido, 31/08/2026] enterTenantMaintenance/exitTenantMaintenance
// (acesso de suporte somente-leitura, sem escolher uma pessoa) — ver
// enterTenantAsOwner/impersonateUser/exitImpersonation acima.

function parseDateTime(date: string, time: string) {
  const value = new Date(`${date}T${time || "00:00"}:00`);
  if (Number.isNaN(value.getTime())) throw new Error("Data ou horário inválido.");
  return value.toISOString();
}

export async function createMaintenanceWindow(formData: FormData) {
  const { supabase, profile } = await requireSuperAdmin();
  const scope = String(formData.get("scope") ?? "tenant");
  const tenantId = String(formData.get("tenant_id") ?? "").trim() || null;
  const mode = String(formData.get("mode") ?? "schedule");
  const title = String(formData.get("title") ?? "Janela de manutenção").trim();
  const message = String(formData.get("message") ?? "").trim();
  const startDate = String(formData.get("start_date") ?? "");
  const startTime = String(formData.get("start_time") ?? "");
  const endDate = String(formData.get("end_date") ?? "");
  const endTime = String(formData.get("end_time") ?? "");

  if (!['tenant', 'platform'].includes(scope)) throw new Error("Escopo inválido.");
  if (scope === "tenant" && !tenantId) throw new Error("Selecione um tenant.");
  if (!message) throw new Error("Informe o aviso da manutenção.");

  const startsAt = mode === "now" ? new Date().toISOString() : parseDateTime(startDate, startTime);
  const endsAt = parseDateTime(endDate, endTime);
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error("O fim precisa ser depois do início.");

  const { data: window, error } = await supabase
    .from("maintenance_windows")
    .insert({
      scope,
      tenant_id: scope === "tenant" ? tenantId : null,
      title: title || "Janela de manutenção",
      message,
      starts_at: startsAt,
      ends_at: endsAt,
      status: "scheduled",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error || !window) throw new Error(error?.message ?? "Não foi possível criar a manutenção.");

  let usersQuery = supabase.from("users").select("id, tenant_id").eq("is_active", true).not("tenant_id", "is", null);
  if (scope === "tenant") usersQuery = usersQuery.eq("tenant_id", tenantId);
  const { data: users } = await usersQuery;
  if (users?.length) {
    await supabase.from("notifications").insert(users.map((user) => ({
      tenant_id: user.tenant_id,
      user_id: user.id,
      type: "maintenance",
      title: title || "Janela de manutenção",
      message,
      link: "/monitoramento",
    })));
  }

  await supabase.rpc("write_audit_log", {
    p_action: "maintenance.created",
    p_entity: "maintenance_windows",
    p_entity_id: window.id,
    p_tenant_id: scope === "tenant" ? tenantId : null,
    p_category: "admin",
    p_metadata: { scope, starts_at: startsAt, ends_at: endsAt },
  });
  revalidatePath("/admin/maintenance");
  revalidatePath("/monitoramento");
  redirect("/admin/maintenance?success=created");
}

export async function cancelMaintenanceWindow(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) throw new Error("Manutenção inválida.");
  const { error } = await supabase.from("maintenance_windows").update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.rpc("write_audit_log", {
    p_action: "maintenance.cancelled",
    p_entity: "maintenance_windows",
    p_entity_id: id,
    p_category: "admin",
  });
  revalidatePath("/admin/maintenance");
}

export async function manuallyValidateOab(formData: FormData) {
  const { supabase } = await requireSuperAdmin();
  const userId = String(formData.get("user_id") ?? "").trim();
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const oabNumber = String(formData.get("oab_number") ?? "").trim();
  const oabUf = String(formData.get("oab_uf") ?? "").trim().toUpperCase();

  if (!userId) throw new Error("Selecione o membro da equipe.");
  if (!tenantId) throw new Error("tenant_id obrigatório.");
  if (!oabNumber) throw new Error("Informe o número da OAB.");
  if (!/^[A-Z]{2}$/.test(oabUf)) throw new Error("Informe a UF da OAB (2 letras).");

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, name, tenant_id, is_active")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .single();

  if (userError || !user) throw new Error("Usuário não encontrado neste escritório.");
  if (!user.is_active) throw new Error("Usuário está desativado.");

  const { data: existingValidation } = await supabase
    .from("oab_validations")
    .select("id, status")
    .eq("user_id", userId)
    .in("status", ["pendente", "aguardando_cs", "recaptcha_em_andamento", "aguardando_codigo", "validando"])
    .maybeSingle();

  if (existingValidation) {
    throw new Error("Já existe uma validação em andamento para este usuário. Aguarde ou cancele a anterior.");
  }

  const { error: rpcError } = await createServiceClient().rpc("finalize_oab_validation", {
    p_user_id: userId,
    p_tenant_id: tenantId,
    p_oab_number: oabNumber,
    p_oab_uf: oabUf,
  });

  if (rpcError) {
    console.error("[admin/manuallyValidateOab] finalize_oab_validation falhou:", rpcError);
    throw new Error(`Falha ao finalizar validação: ${rpcError.message}`);
  }

  const { error: insertError } = await createServiceClient()
    .from("oab_validations")
    .insert({
      tenant_id: tenantId,
      user_id: userId,
      oab_number: oabNumber,
      oab_uf: oabUf,
      professional_email: "validacao-manual@meujudi.com.br",
      requester_name: "Super Admin",
      status: "validada",
      provider: "manual",
      verified_at: new Date().toISOString(),
    });

  if (insertError) {
    console.error("[admin/manuallyValidateOab] insert oab_validations falhou:", insertError);
  }

  // [corrigido 31/08/2026] Faltava aqui — só o caminho do ConfirmADV via CS
  // disparava a descoberta imediata; a validação manual do Admin deixava a
  // OAB esperando o próximo balde de 6h dos crons (ou, antes da migration
  // 20260831000000, nunca era descoberta). Não bloqueia a resposta: falha
  // aqui não deve impedir a validação de aparecer concluída.
  dispararDescobertaInicial(tenantId, oabNumber, oabUf).catch((error) => {
    console.error("[admin/manuallyValidateOab] falha ao disparar descoberta inicial:", error);
  });

  await supabase.rpc("write_audit_log", {
    p_action: "oab.manually_validated",
    p_entity: "oab_validations",
    p_entity_id: userId,
    p_tenant_id: tenantId,
    p_category: "admin",
    p_metadata: { oab_number: oabNumber, oab_uf: oabUf, user_name: user.name },
  });

  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const, message: `OAB ${oabNumber}/${oabUf} validada manualmente para ${user.name}.` };
}

export async function deleteTenant(formData: FormData) {
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!tenantId) throw new Error("tenant_id obrigatório.");
  if (confirmation !== "EXCLUIR") throw new Error("Confirmação inválida. Digite EXCLUIR.");

  const { supabase } = await requireSuperAdmin();

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq("id", tenantId)
    .single();
  if (tenantError || !tenant) throw new Error("Escritório não encontrado.");

  const serviceClient = createServiceClient();

  const { count: userCount } = await serviceClient
    .from("users")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("is_active", true);

  if ((userCount ?? 0) > 0) {
    throw new Error(`Existem ${userCount} usuário(s) ativo(s) neste escritório. Desative ou remova todos antes de excluir.`);
  }

  await serviceClient.rpc("write_audit_log", {
    p_action: "tenant.deleted",
    p_entity: "tenants",
    p_entity_id: tenantId,
    p_tenant_id: tenantId,
    p_category: "admin",
    p_metadata: { name: tenant.name, slug: tenant.slug },
  });

  const { error } = await serviceClient.from("tenants").delete().eq("id", tenantId);
  if (error) throw new Error(`Falha ao excluir escritório: ${error.message}`);

  revalidatePath("/admin");
  revalidatePath("/admin/tenants");
  return { ok: true as const, message: `Escritório "${tenant.name}" excluído com sucesso.` };
}

export async function deleteUser(formData: FormData) {
  const userId = String(formData.get("user_id") ?? "").trim();
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (!userId) throw new Error("user_id obrigatório.");
  if (!tenantId) throw new Error("tenant_id obrigatório.");
  if (confirmation !== "EXCLUIR") throw new Error("Confirmação inválida. Digite EXCLUIR.");

  const { supabase } = await requireSuperAdmin();

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, name, email, tenant_id, role")
    .eq("id", userId)
    .eq("tenant_id", tenantId)
    .single();
  if (userError || !user) throw new Error("Usuário não encontrado neste escritório.");
  if (user.role === "owner") throw new Error("Não é possível excluir o proprietário do escritório.");

  const serviceClient = createServiceClient();

  await serviceClient.rpc("write_audit_log", {
    p_action: "user.deleted",
    p_entity: "users",
    p_entity_id: userId,
    p_tenant_id: tenantId,
    p_category: "admin",
    p_metadata: { name: user.name, email: user.email },
  });

  const { error } = await serviceClient.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Falha ao excluir usuário: ${error.message}`);

  revalidatePath("/admin");
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true as const, message: `Usuário "${user.name}" excluído com sucesso.` };
}
