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

export async function exitTenantMaintenance() {
  const cookieStore = await cookies();
  cookieStore.delete(SUPPORT_TENANT_COOKIE);
  redirect("/admin/tenants");
}
