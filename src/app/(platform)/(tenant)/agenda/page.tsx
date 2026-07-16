import { AgendaCalendar, type AgendaItem } from "./agenda-calendar";
import { requireAppUser } from "@/lib/auth/guards";

type AgendaRow = {
  id: string;
  tipo: AgendaItem["type"];
  titulo: string;
  descricao: string | null;
  data_inicio: string;
  data_fim: string | null;
  status: AgendaItem["status"];
  fonte: string;
  processo_id: string | null;
};

type ProcessRow = {
  id: string;
  classe_nome: string | null;
  autor: string | null;
  reu: string | null;
};

function buildProcessTitle(process: ProcessRow | undefined) {
  if (!process) return null;
  const parties = [process.autor, process.reu].filter(Boolean).join(" x ");
  return parties ? `${process.classe_nome ?? "Processo"} - ${parties}` : process.classe_nome ?? "Processo";
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
  return { start, end, initialMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` };
}

export default async function AgendaPage() {
  const { supabase, profile } = await requireAppUser();
  const { start, end, initialMonth } = monthRange();

  const { data: agendaRows } = await supabase
    .from("agenda_eventos")
    .select("id, tipo, titulo, descricao, data_inicio, data_fim, status, fonte, processo_id")
    .eq("tenant_id", profile.tenant_id)
    .gte("data_inicio", start.toISOString())
    .lte("data_inicio", end.toISOString())
    .order("data_inicio", { ascending: true });

  const processIds = Array.from(new Set((agendaRows ?? []).map((event) => event.processo_id).filter(Boolean)));
  const { data: processRows } = processIds.length
    ? await supabase
        .from("processos")
        .select("id, classe_nome, autor, reu")
        .in("id", processIds)
    : { data: [] };

  const processById = new Map(((processRows ?? []) as ProcessRow[]).map((process) => [process.id, process]));
  const events: AgendaItem[] = ((agendaRows ?? []) as AgendaRow[]).map((event) => ({
    id: event.id,
    title: event.titulo,
    description: event.descricao,
    type: event.tipo,
    start: event.data_inicio,
    end: event.data_fim,
    status: event.status,
    source: event.fonte,
    processTitle: event.processo_id ? buildProcessTitle(processById.get(event.processo_id)) : null,
  }));

  return <AgendaCalendar initialMonth={initialMonth} events={events} />;
}
