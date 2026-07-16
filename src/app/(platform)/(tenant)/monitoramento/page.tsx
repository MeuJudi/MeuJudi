import { MonitoramentoView, type KanbanColumn, type MonitorProcess } from "./monitoramento-view";
import { requireAppUser } from "@/lib/auth/guards";

type ProcessRow = {
  id: string;
  cnj: string;
  tribunal: string | null;
  classe_nome: string | null;
  autor: string | null;
  reu: string | null;
  prazo_proxima_resposta: string | null;
  proxima_audiencia: string | null;
  status: "ativo" | "suspenso" | "arquivado" | "concluido";
  kanban_column_id: string | null;
  tags: string[] | null;
  is_favorito: boolean;
  data_ultima_movimentacao: string | null;
};

type KanbanColumnRow = {
  id: string;
  name: string;
  position: number;
  color: string;
  is_default: boolean;
};

const defaultKanbanColumns = [
  { name: "Novo", color: "#9a6a22" },
  { name: "Em analise", color: "#2563eb" },
  { name: "Aguardando cliente", color: "#7c3aed" },
  { name: "Aguardando tribunal", color: "#0e7490" },
  { name: "Prazo proximo", color: "#7a2e2e" },
  { name: "Encerrado", color: "#4b6b4e" },
];

type MovementRow = {
  processo_id: string;
  nome: string;
  data_movimento: string;
  is_novo: boolean;
};

type MuralRow = {
  id: string;
  tipo_comunicacao: string;
  sigla_tribunal: string;
  data_disponibilizacao: string;
  processo_id: string | null;
};

const statusLabel: Record<MonitorProcess["status"], string> = {
  ativo: "Em acompanhamento",
  suspenso: "Aguardando",
  arquivado: "Arquivado",
  concluido: "Concluido",
};

function formatCnj(cnj: string) {
  return cnj.length === 20
    ? `${cnj.slice(0, 7)}-${cnj.slice(7, 9)}.${cnj.slice(9, 13)}.${cnj.slice(13, 14)}.${cnj.slice(14, 16)}.${cnj.slice(16)}`
    : cnj;
}

function buildTitle(process: ProcessRow) {
  const className = process.classe_nome ?? "Processo";
  const parties = [process.autor, process.reu].filter(Boolean).join(" x ");
  return parties ? `${className} - ${parties}` : className;
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

async function ensureKanbanColumns(
  supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"],
  profile: Awaited<ReturnType<typeof requireAppUser>>["profile"],
  tenantId: string,
) {
  const { data: existingRows } = await supabase
    .from("process_kanban_columns")
    .select("id, name, position, color, is_default")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("position", { ascending: true });

  if ((existingRows ?? []).length > 0) {
    return (existingRows ?? []) as KanbanColumnRow[];
  }

  const { data: insertedRows } = await supabase
    .from("process_kanban_columns")
    .insert(defaultKanbanColumns.map((column, index) => ({
      tenant_id: tenantId,
      name: column.name,
      position: index,
      color: column.color,
      is_default: true,
      created_by: profile.id,
    })))
    .select("id, name, position, color, is_default")
    .order("position", { ascending: true });

  return (insertedRows ?? []) as KanbanColumnRow[];
}

export default async function MonitoramentoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; tenant?: string }>;
}) {
  const params = await searchParams;
  const { supabase, profile } = await requireAppUser();
  const tenantId = await resolveTenantId(supabase, profile, params.tenant);

  if (!tenantId) {
    return (
      <MonitoramentoView
        tenantId={null}
        kanbanColumns={[]}
        processes={[]}
        metrics={{ active: 0, newMovements: 0, upcomingDeadlines: 0, muralPending: 0 }}
        muralItems={[]}
        error={params.error ? decodeURIComponent(params.error) : undefined}
      />
    );
  }

  const kanbanColumns = await ensureKanbanColumns(supabase, profile, tenantId);
  const defaultColumnId = kanbanColumns[0]?.id ?? null;

  if (defaultColumnId) {
    await supabase
      .from("processos")
      .update({ kanban_column_id: defaultColumnId })
      .eq("tenant_id", tenantId)
      .is("kanban_column_id", null);
  }

  const [{ data: processRows }, { data: movementRows }, { data: muralRows }] = await Promise.all([
    supabase
      .from("processos")
      .select("id, cnj, tribunal, classe_nome, autor, reu, prazo_proxima_resposta, proxima_audiencia, status, kanban_column_id, tags, is_favorito, data_ultima_movimentacao")
      .eq("tenant_id", tenantId)
      .order("data_ultima_movimentacao", { ascending: false, nullsFirst: false })
      .limit(120),
    supabase
      .from("movimentacoes")
      .select("processo_id, nome, data_movimento, is_novo")
      .eq("tenant_id", tenantId)
      .order("data_movimento", { ascending: false })
      .limit(300),
    supabase
      .from("comunicacoes_mural")
      .select("id, tipo_comunicacao, sigla_tribunal, data_disponibilizacao, processo_id")
      .eq("tenant_id", tenantId)
      .order("data_disponibilizacao", { ascending: false })
      .limit(20),
  ]);

  const movements = (movementRows ?? []) as MovementRow[];
  const latestMovementByProcess = new Map<string, MovementRow>();
  const unreadCountByProcess = new Map<string, number>();

  for (const movement of movements) {
    if (!latestMovementByProcess.has(movement.processo_id)) {
      latestMovementByProcess.set(movement.processo_id, movement);
    }
    if (movement.is_novo) {
      unreadCountByProcess.set(movement.processo_id, (unreadCountByProcess.get(movement.processo_id) ?? 0) + 1);
    }
  }

  const processes: MonitorProcess[] = ((processRows ?? []) as ProcessRow[]).map((process) => {
    const latestMovement = latestMovementByProcess.get(process.id);
    return {
      id: process.id,
      cnj: formatCnj(process.cnj),
      title: buildTitle(process),
      subtitle: [process.autor, process.reu].filter(Boolean).join(" x ") || "Sem partes cadastradas",
      tribunal: process.tribunal ?? "-",
      status: process.status,
      statusLabel: statusLabel[process.status],
      kanbanColumnId: process.kanban_column_id ?? defaultColumnId,
      tags: process.tags ?? [],
      isFavorito: process.is_favorito,
      prazoProximaResposta: process.prazo_proxima_resposta,
      proximaAudiencia: process.proxima_audiencia,
      dataUltimaMovimentacao: process.data_ultima_movimentacao,
      latestMovement: latestMovement?.nome ?? null,
      unreadMovements: unreadCountByProcess.get(process.id) ?? 0,
    };
  });

  const processTitleById = new Map(processes.map((process) => [process.id, process.title]));
  const muralItems = ((muralRows ?? []) as MuralRow[]).map((item) => ({
    id: item.id,
    title: item.tipo_comunicacao,
    tribunal: item.sigla_tribunal,
    date: item.data_disponibilizacao,
    processTitle: item.processo_id ? processTitleById.get(item.processo_id) ?? null : null,
  }));

  const today = new Date();
  const nextThirtyDays = new Date();
  nextThirtyDays.setDate(today.getDate() + 30);

  const metrics = {
    active: processes.filter((process) => process.status === "ativo").length,
    newMovements: movements.filter((movement) => movement.is_novo).length,
    upcomingDeadlines: processes.filter((process) => {
      if (!process.prazoProximaResposta) return false;
      const date = new Date(process.prazoProximaResposta);
      return date >= today && date <= nextThirtyDays;
    }).length,
    muralPending: muralItems.length,
  };

  return (
    <MonitoramentoView
      tenantId={tenantId}
      kanbanColumns={kanbanColumns.map((column): KanbanColumn => ({
        id: column.id,
        name: column.name,
        position: column.position,
        color: column.color,
        isDefault: column.is_default,
      }))}
      processes={processes}
      metrics={metrics}
      muralItems={muralItems}
      error={params.error ? decodeURIComponent(params.error) : undefined}
    />
  );
}
