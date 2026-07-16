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
  user_id: string | null;
};

type ProcessRow = {
  id: string;
  classe_nome: string | null;
  autor: string | null;
  reu: string | null;
};

type UserRow = {
  id: string;
  name: string;
  avatar_url: string | null;
};

const lawyerColors = ["#0f766e", "#7c3aed", "#be123c", "#2563eb", "#b45309", "#15803d", "#c026d3", "#0e7490"];

function buildProcessTitle(process: ProcessRow | undefined) {
  if (!process) return null;
  const parties = [process.autor, process.reu].filter(Boolean).join(" x ");
  return parties ? `${process.classe_nome ?? "Processo"} - ${parties}` : process.classe_nome ?? "Processo";
}

function colorForUser(seed: string | null) {
  if (!seed) return "#5b5548";
  const index = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % lawyerColors.length;
  return lawyerColors[index];
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
  return { start, end, initialMonth: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` };
}

async function resolveTenantId(
  supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"],
  profile: Awaited<ReturnType<typeof requireAppUser>>["profile"],
  requestedTenantId: string | undefined,
) {
  if (profile.tenant_id) return profile.tenant_id;
  if (profile.role !== "super_admin") return null;

  if (requestedTenantId) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("id", requestedTenantId)
      .maybeSingle();

    if (tenant?.id) return tenant.id as string;
  }

  const { data: demoTenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "escritorio-demo-meujudi")
    .maybeSingle();

  return demoTenant?.id ?? null;
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>;
}) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const { start, end, initialMonth } = monthRange();
  const tenantId = await resolveTenantId(supabase, profile, params.tenant);

  if (!tenantId) {
    return <AgendaCalendar initialMonth={initialMonth} events={[]} />;
  }

  const { data: agendaRows } = await supabase
    .from("agenda_eventos")
    .select("id, tipo, titulo, descricao, data_inicio, data_fim, status, fonte, processo_id, user_id")
    .eq("tenant_id", tenantId)
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

  const userIds = Array.from(new Set((agendaRows ?? []).map((event) => event.user_id).filter(Boolean)));
  const { data: userRows } = userIds.length
    ? await supabase
        .from("users")
        .select("id, name, avatar_url")
        .in("id", userIds)
    : { data: [] };

  const processById = new Map(((processRows ?? []) as ProcessRow[]).map((process) => [process.id, process]));
  const userById = new Map(((userRows ?? []) as UserRow[]).map((user) => [user.id, user]));
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
    responsibleName: event.user_id ? userById.get(event.user_id)?.name ?? null : null,
    responsibleAvatarUrl: event.user_id ? userById.get(event.user_id)?.avatar_url ?? null : null,
    responsibleColor: colorForUser(event.user_id),
  }));

  return <AgendaCalendar initialMonth={initialMonth} events={events} />;
}
