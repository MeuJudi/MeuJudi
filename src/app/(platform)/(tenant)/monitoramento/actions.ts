"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/guards";

const allowedStatuses = ["ativo", "suspenso", "arquivado", "concluido"] as const;

export async function updateProcessStatus(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id || !allowedStatuses.includes(status as (typeof allowedStatuses)[number])) {
    redirect("/monitoramento?error=status_invalido");
  }

  const { supabase } = await requireAppUser();
  const { error } = await supabase
    .from("processos")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    redirect(`/monitoramento?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/monitoramento");
}
