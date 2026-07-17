"use server";

import { revalidatePath } from "next/cache";
import { requireAppUser } from "@/lib/auth/guards";

function applyDatePreservingTime(value: string, dateKey: string) {
  const next = new Date(value);
  const [year, month, day] = dateKey.split("-").map(Number);
  next.setFullYear(year, month - 1, day);
  return next;
}

function validateDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error("Data invalida.");
  }
}

function isOfficialLocked(event: { tipo: string; fonte: string }) {
  return event.fonte !== "manual" && (event.tipo === "audiencia" || event.tipo === "prazo");
}

function needsStrongConfirmation(event: { tipo: string; fonte: string }) {
  return event.fonte !== "manual" || event.tipo === "audiencia" || event.tipo === "prazo";
}

export async function rescheduleAgendaEvent(eventId: string, dateKey: string, confirmSensitive = false) {
  validateDateKey(dateKey);

  const { supabase, profile } = await requireAppUser();
  const { data: event, error } = await supabase
    .from("agenda_eventos")
    .select("id, tenant_id, tipo, fonte, data_inicio, data_fim")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    throw new Error("Evento nao encontrado.");
  }

  if (profile.role !== "super_admin" && event.tenant_id !== profile.tenant_id) {
    throw new Error("Voce nao tem acesso a este evento.");
  }

  if (isOfficialLocked(event)) {
    throw new Error("Este evento parece ser oficial. Crie um lembrete interno em vez de mover a data original.");
  }

  if (needsStrongConfirmation(event) && !confirmSensitive) {
    throw new Error("Este evento precisa de confirmacao antes de ser movido.");
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

export async function createInternalReminderFromAgendaEvent(eventId: string, dateKey: string) {
  validateDateKey(dateKey);

  const { supabase, profile } = await requireAppUser();
  const { data: event, error } = await supabase
    .from("agenda_eventos")
    .select("id, tenant_id, processo_id, tipo, titulo, descricao, data_inicio")
    .eq("id", eventId)
    .single();

  if (error || !event) {
    throw new Error("Evento nao encontrado.");
  }

  if (profile.role !== "super_admin" && event.tenant_id !== profile.tenant_id) {
    throw new Error("Voce nao tem acesso a este evento.");
  }

  const nextStart = applyDatePreservingTime(event.data_inicio, dateKey);
  const officialDate = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(event.data_inicio));

  const { data: reminder, error: insertError } = await supabase
    .from("agenda_eventos")
    .insert({
      tenant_id: event.tenant_id,
      processo_id: event.processo_id,
      user_id: profile.id,
      tipo: "outro",
      titulo: `Lembrete: ${event.titulo}`,
      descricao: [
        "Lembrete interno criado a partir de evento oficial.",
        `Data oficial mantida: ${officialDate}.`,
        event.descricao,
      ].filter(Boolean).join(" "),
      data_inicio: nextStart.toISOString(),
      fonte: "manual",
      status: "pendente",
    })
    .select("id, titulo, descricao, data_inicio, data_fim, status, fonte")
    .single();

  if (insertError || !reminder) {
    throw new Error(insertError?.message ?? "Nao foi possivel criar o lembrete interno.");
  }

  revalidatePath("/agenda");

  return {
    id: reminder.id,
    title: reminder.titulo,
    description: reminder.descricao,
    type: "outro" as const,
    start: reminder.data_inicio,
    end: reminder.data_fim,
    status: reminder.status,
    source: reminder.fonte,
    processId: event.processo_id,
    processTitle: null,
    clienteId: null,
    clienteName: null,
    responsibleName: profile.name,
    responsibleAvatarUrl: null,
    responsibleColor: "#5b5548",
    userId: profile.id,
  };
}

/* ─── Create Event ─── */

export async function createAgendaEvent(data: {
  tipo: string;
  titulo: string;
  descricao?: string;
  data_inicio: string;
  data_fim?: string;
  cliente_id?: string;
  processo_id?: string;
}) {
  const cleanTitulo = data.titulo.trim();
  if (!cleanTitulo) throw new Error("Informe um titulo para o evento.");
  if (!data.data_inicio) throw new Error("Informe a data e hora do evento.");

  const { supabase, profile } = await requireAppUser();

  const { data: event, error } = await supabase
    .from("agenda_eventos")
    .insert({
      tenant_id: profile.tenant_id,
      user_id: profile.id,
      tipo: data.tipo,
      titulo: cleanTitulo,
      descricao: data.descricao?.trim() || null,
      data_inicio: data.data_inicio,
      data_fim: data.data_fim || null,
      cliente_id: data.cliente_id || null,
      processo_id: data.processo_id || null,
      fonte: "manual",
      status: "pendente",
    })
    .select("id")
    .single();

  if (error || !event) throw new Error(error?.message ?? "Nao foi possivel criar o evento.");

  revalidatePath("/agenda");
  return { id: event.id };
}
