"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth/guards";

function applyDatePreservingTime(value: string, dateKey: string) {
  const next = new Date(value);
  const [year, month, day] = dateKey.split("-").map(Number);
  next.setFullYear(year, month - 1, day);
  return next;
}

export async function rescheduleAgendaEvent(eventId: string, dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Data invalida.");
  }

  const { supabase, profile } = await requireAppUser();
  const { data: event, error } = await supabase
    .from("agenda_eventos")
    .select("id, tenant_id, data_inicio, data_fim")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    throw new Error("Evento nao encontrado.");
  }

  if (profile.role !== "super_admin" && event.tenant_id !== profile.tenant_id) {
    throw new Error("Voce nao tem acesso a este evento.");
  }

  const nextStart = applyDatePreservingTime(event.data_inicio, dateKey);
  const update: { data_inicio: string; data_fim?: string } = {
    data_inicio: nextStart.toISOString(),
  };

  if (event.data_fim) {
    const oldStart = new Date(event.data_inicio).getTime();
    const oldEnd = new Date(event.data_fim).getTime();
    update.data_fim = new Date(nextStart.getTime() + Math.max(0, oldEnd - oldStart)).toISOString();
  }

  const { error: updateError } = await supabase
    .from("agenda_eventos")
    .update(update)
    .eq("id", eventId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  revalidatePath("/agenda");
}
