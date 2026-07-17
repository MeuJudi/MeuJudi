"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(formData: FormData) {
  const tenantName = String(formData.get("tenant_name") ?? "").trim();
  const userName = String(formData.get("user_name") ?? "").trim();
  if (!tenantName || !userName) {
    redirect("/onboarding?error=Preencha%20o%20nome%20do%20escrit%C3%B3rio%20e%20o%20seu%20nome.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_tenant_onboarding", {
    p_tenant_name: tenantName,
    p_user_name: userName,
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
