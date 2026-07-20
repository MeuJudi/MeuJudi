"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function completeOnboarding(formData: FormData) {
  const tenantName = String(formData.get("tenant_name") ?? "").trim();
  const userName = String(formData.get("user_name") ?? "").trim();
  if (!tenantName || !userName) {
    redirect("/onboarding?error=Preencha%20o%20nome%20do%20escrit%C3%B3rio%20e%20o%20seu%20nome.");
  }

  const supabase = await createClient();
  const { data: tenantId, error } = await supabase.rpc("complete_tenant_onboarding", {
    p_tenant_name: tenantName,
    p_user_name: userName,
    p_city: String(formData.get("city") ?? ""),
    p_state: String(formData.get("state") ?? ""),
    p_oab_number: String(formData.get("oab_number") ?? ""),
    p_oab_uf: String(formData.get("oab_uf") ?? ""),
    p_phone: String(formData.get("phone") ?? ""),
    p_cnpj: String(formData.get("cnpj") ?? ""),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase.from("users").update({
      oab_number: String(formData.get("oab_number") ?? "").trim() || null,
      oab_uf: String(formData.get("oab_uf") ?? "").trim().toUpperCase() || null,
      gender: String(formData.get("gender") ?? "neutral"),
      phone: String(formData.get("phone") ?? "").trim() || null,
    }).eq("id", user.id);
  }

  return { success: true };
}

export async function completeMemberOnboarding(formData: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("complete_invited_member_onboarding", {
    p_user_name: String(formData.get("name") ?? "").trim(),
    p_phone: String(formData.get("phone") ?? ""),
    p_oab_number: String(formData.get("oab_number") ?? ""),
    p_oab_uf: String(formData.get("oab_uf") ?? ""),
    p_gender: String(formData.get("gender") ?? "neutral"),
  });

  if (error) return { success: false, error: error.message === "invite_not_found" ? "Este email ainda não recebeu um convite válido do escritório." : error.message };
  return { success: true, tenantId: data as string };
}

export async function uploadAvatar(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const file = formData.get("file") as File;
  if (!file || file.size === 0) throw new Error("Nenhum arquivo selecionado");

  const fileExt = file.name.split(".").pop();
  const fileName = `${user.id}/avatar.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(fileName, buffer, {
      upsert: true,
      contentType: file.type || "image/png",
    });

  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(fileName);

  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (updateError) throw updateError;

  revalidatePath("/onboarding");
  return { url: publicUrl };
}

export async function createInvites(
  invites: Array<{ email: string; role: string }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Não autenticado");

  const { data: profile } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) throw new Error("Tenant não encontrado");

  const results: Array<{ email: string; error?: string }> = [];

  for (const invite of invites) {
    const { error } = await supabase.from("tenant_invites").insert({
      tenant_id: profile.tenant_id,
      email: invite.email.toLowerCase().trim(),
      role: invite.role,
      invited_by: user.id,
    });

    results.push({
      email: invite.email,
      error: error?.message,
    });
  }

  return results;
}

export async function resendConfirmation() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await supabase.auth.resend({ type: "signup", email: user.email });
  }
  redirect("/onboarding?success=email_resent");
}
