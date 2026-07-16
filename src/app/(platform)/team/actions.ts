"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwner } from "@/lib/auth/guards";

export async function createInvite(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "lawyer");
  const { supabase } = await requireOwner();

  if (!email) {
    redirect("/team?error=email_required");
  }

  const { error } = await supabase.rpc("create_tenant_invite", {
    p_email: email,
    p_role: role,
  });

  if (error) {
    redirect(`/team?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/team");
  redirect("/team?success=invite_created");
}
