"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";

/**
 * Liga/desliga o envio de logs sob demanda pra um dispositivo específico.
 * Gate real fica no servidor (rota /api/cs/logs/upload confere de novo) —
 * isso aqui só decide se o botão aparece na tela do usuário.
 */
export async function toggleDeviceLogUpload(formData: FormData) {
  const deviceId = String(formData.get("device_id") ?? "");
  const enabled = String(formData.get("enabled")) === "true";
  const { supabase } = await requireSuperAdmin();

  if (!deviceId) {
    throw new Error("device_id obrigatorio");
  }

  const { data, error } = await supabase
    .from("cs_devices")
    .update({ log_upload_enabled: enabled })
    .eq("id", deviceId)
    .select("tenant_id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  await supabase.rpc("write_audit_log", {
    p_action: enabled ? "cs_device.log_upload_enabled" : "cs_device.log_upload_disabled",
    p_entity: "cs_devices",
    p_entity_id: deviceId,
    p_tenant_id: data.tenant_id,
    p_category: "admin",
  });

  revalidatePath("/admin/cs-diagnostics");
}
