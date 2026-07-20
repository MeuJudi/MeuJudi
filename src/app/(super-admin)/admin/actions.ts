"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { SUPPORT_TENANT_COOKIE } from "@/lib/supabase/auth-scope";

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

export async function enterTenantMaintenance(formData: FormData) {
  const tenantId = String(formData.get("tenant_id") ?? "").trim();
  if (!tenantId) throw new Error("tenant_id obrigatorio");

  const { supabase } = await requireSuperAdmin();
  const { data: tenant, error } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", tenantId)
    .single();

  if (error || !tenant) throw new Error("Tenant nao encontrado");

  const cookieStore = await cookies();
  cookieStore.set(SUPPORT_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 30,
  });

  redirect(`/monitoramento?tenant=${encodeURIComponent(tenantId)}`);
}

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

export async function exitTenantMaintenance() {
  const cookieStore = await cookies();
  cookieStore.delete(SUPPORT_TENANT_COOKIE);
  redirect("/admin/tenants");
}
