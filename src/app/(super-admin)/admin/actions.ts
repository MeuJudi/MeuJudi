"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";

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
