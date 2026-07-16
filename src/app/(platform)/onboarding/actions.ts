"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_tenant_onboarding", {
    p_tenant_name: String(formData.get("tenant_name") ?? ""),
    p_user_name: String(formData.get("user_name") ?? ""),
    p_city: String(formData.get("city") ?? ""),
    p_state: String(formData.get("state") ?? ""),
    p_oab_number: String(formData.get("oab_number") ?? ""),
    p_oab_uf: String(formData.get("oab_uf") ?? ""),
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/monitoramento");
}
