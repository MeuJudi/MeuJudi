"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWritableTenantDataAccess as requireAppUser } from "@/lib/auth/tenant-access";
import { createServiceClient } from "@/lib/supabase/service";
import { sincronizarProcessoDataJud } from "@/lib/datajud/sincronizar-processo";
import { buscarCnjsComTarefaAberta, buscarProcessosCandidatosPdpj } from "@/lib/tribunais/pdpj-tarefas-abertas";

const allowedStatuses = ["ativo", "suspenso", "arquivado", "concluido"] as const;
const columnColors = ["#9a6a22", "#4b6b4e", "#7a2e2e", "#2563eb", "#7c3aed", "#0e7490"];

function syncErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) return String(error.message);
  return "Falha desconhecida durante a sincronização.";
}

/*
 * The monitoramento screen intentionally has no demo-data action. Real process
 * data must come from the tenant workflow, CS/PDPJ, DataJud or Mural.
 */
/* const demoProcesses = [
  ["10000012320268260001", "TJSP", "1º grau", "PJe", 436, "Procedimento Comum Civel", "Solaris Comercio Ltda.", "Banco Aurora S.A.", "ativo", ["civel", "contrato"], 125000],
  ["10000024520264030000", "TRF3", "2º grau", "eproc", 198, "Apelacao Civel", "Marina Lopes", "Uniao Federal", "ativo", ["federal", "recurso"], 48000],
  ["10000036720255020001", "TRT2", "1º grau", "PJe", 985, "Reclamacao Trabalhista", "Rafael Antunes", "Metalurgica Vale Norte", "ativo", ["trabalhista", "audiencia"], 76000],
  ["10000048920268190001", "TJRJ", "1º grau", "DCP", 1116, "Execucao de Titulo Extrajudicial", "Condominio Jardim Azul", "Helena Duarte", "suspenso", ["execucao", "cobranca"], 32000],
  ["10000050120268070001", "TJDFT", "1º grau", "PJe", 7, "Mandado de Seguranca Civel", "Clinica Vida Plena", "Secretario de Saude", "ativo", ["mandado", "urgente"], 10000],
  ["10000062320258260002", "TJSP", "2º grau", "SAJ", 12078, "Agravo de Instrumento", "Norte Park Incorporadora", "Municipio de Campinas", "ativo", ["imobiliario", "recurso"], 220000],
  ["10000074520266040000", "TRF4", "1º grau", "eproc", 29, "Acao Ordinaria Previdenciaria", "Joao Batista Ramos", "INSS", "ativo", ["previdenciario"], 38000],
  ["10000086720255090001", "TRT9", "2º grau", "PJe", 1001, "Recurso Ordinario Trabalhista", "Alessandra Pires", "Logistica Sul S.A.", "concluido", ["trabalhista", "recurso"], 59000],
  ["10000098920258080001", "TJES", "1º grau", "PJe", 40, "Acao de Alimentos", "L.C.S.", "M.R.S.", "ativo", ["familia", "sigiloso"], 0],
  ["10000110120268130024", "TJMG", "1º grau", "PJe", 282, "Inventario", "Espolio de Carlos Mendes", "Interessados", "ativo", ["sucessoes", "patrimonio"], 670000],
  ["10000122320268050001", "TJBA", "1º grau", "Projudi", 37, "Busca e Apreensao em Alienacao Fiduciaria", "Banco Horizonte", "Lucas Vieira", "ativo", ["bancario", "liminar"], 84000],
  ["10000134520259010000", "TRF1", "1º grau", "PJe", 65, "Acao Civil Publica", "Associacao Verde Vivo", "IBAMA", "suspenso", ["ambiental", "coletivo"], 500000],
  ["10000146720268240001", "TJSC", "1º grau", "eproc", 156, "Consignacao em Pagamento", "Mercado Bela Ilha", "Distribuidora Atlante", "arquivado", ["empresarial"], 18500],
  ["10000158920267030000", "TRF3", "Juizado", "PJe", 436, "Procedimento do Juizado Especial Civel", "Patricia Nunes", "Caixa Economica Federal", "ativo", ["juizado", "consumidor"], 15000],
  ["10000160120268060001", "TJCE", "1º grau", "PJe", 1707, "Interdito Proibitorio", "Fazenda Lagoa Clara", "Ocupantes nao identificados", "ativo", ["posse", "rural"], 91000],
] as const;

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

function atHour(days: number, hour: number, minute = 0) {
  const date = addDays(days);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function getOrCreateDemoTenant(supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"], userId: string) {
  const { data: existing } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", "escritorio-demo-meujudi")
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: vertical, error: verticalError } = await supabase
    .from("verticals")
    .select("id")
    .eq("slug", "meujudi")
    .single();

  if (verticalError || !vertical) {
    redirect("/monitoramento?error=vertical_meujudi_nao_encontrada");
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .insert({
      vertical_id: vertical.id,
      name: "Escritorio Demo MeuJudi",
      slug: "escritorio-demo-meujudi",
      city: "Sao Paulo",
      state: "SP",
      email: "demo@meujudi.local",
      created_by: userId,
      onboarding: { demo: true },
    })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    redirect(`/monitoramento?error=${encodeURIComponent(tenantError?.message ?? "tenant_demo_nao_criado")}`);
  }

  return tenant.id as string;
}

async function resolveSeedTenantId() {
  const { supabase, profile } = await requireAppUser();

  if (profile.tenant_id) {
    return { supabase, profile, tenantId: profile.tenant_id, redirectTenant: false };
  }

  if (profile.role === "super_admin") {
    const tenantId = await getOrCreateDemoTenant(supabase, profile.id);
    return { supabase, profile, tenantId, redirectTenant: true };
  }

  redirect("/monitoramento?error=usuario_sem_escritorio");
} */

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

async function assertColumnAccess(supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"], columnId: string) {
  const { data: column, error } = await supabase
    .from("process_kanban_columns")
    .select("id, tenant_id")
    .eq("id", columnId)
    .single();

  if (error || !column) {
    redirect("/monitoramento?error=coluna_nao_encontrada");
  }

  return column as { id: string; tenant_id: string };
}

export async function moveProcessToColumn(processId: string, columnId: string) {
  const { supabase } = await requireAppUser();
  const column = await assertColumnAccess(supabase, columnId);

  const { error } = await supabase
    .from("processos")
    .update({ kanban_column_id: column.id, updated_at: new Date().toISOString() })
    .eq("id", processId)
    .eq("tenant_id", column.tenant_id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/monitoramento");
}

export async function renameKanbanColumn(columnId: string, name: string) {
  const cleanName = name.trim();
  if (!cleanName || cleanName.length > 60) {
    throw new Error("Nome de coluna invalido.");
  }

  const { supabase } = await requireAppUser();
  await assertColumnAccess(supabase, columnId);

  const { error } = await supabase
    .from("process_kanban_columns")
    .update({ name: cleanName })
    .eq("id", columnId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/monitoramento");
}

export async function createKanbanColumn(tenantId: string, name = "Nova coluna") {
  const { supabase, profile } = await requireAppUser();
  const canUseTenant = profile.tenant_id === tenantId || profile.role === "super_admin";
  if (!canUseTenant) {
    throw new Error("Voce nao tem acesso a este escritorio.");
  }

  const { data: columns } = await supabase
    .from("process_kanban_columns")
    .select("position")
    .eq("tenant_id", tenantId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = ((columns?.[0]?.position as number | undefined) ?? -1) + 1;
  const color = columnColors[nextPosition % columnColors.length];

  const { data: column, error } = await supabase
    .from("process_kanban_columns")
    .insert({
      tenant_id: tenantId,
      name: name.trim() || "Nova coluna",
      position: nextPosition,
      color,
      is_default: false,
      created_by: profile.id,
    })
    .select("id, tenant_id, name, position, color, is_default")
    .single();

  if (error || !column) {
    throw new Error(error?.message ?? "Nao foi possivel criar a coluna.");
  }

  revalidatePath("/monitoramento");
  return column;
}

export async function reorderKanbanColumns(orderedColumnIds: string[]) {
  const { supabase } = await requireAppUser();
  const uniqueIds = Array.from(new Set(orderedColumnIds));

  for (const [position, columnId] of uniqueIds.entries()) {
    await assertColumnAccess(supabase, columnId);
    const { error } = await supabase
      .from("process_kanban_columns")
      .update({ position })
      .eq("id", columnId);

    if (error) {
      throw new Error(error.message);
    }
  }

  revalidatePath("/monitoramento");
}

export async function deleteKanbanColumn(columnId: string, targetColumnId: string) {
  if (columnId === targetColumnId) {
    throw new Error("Escolha uma coluna destino diferente.");
  }

  const { supabase } = await requireAppUser();
  const source = await assertColumnAccess(supabase, columnId);
  const target = await assertColumnAccess(supabase, targetColumnId);

  if (source.tenant_id !== target.tenant_id) {
    throw new Error("As colunas precisam pertencer ao mesmo escritorio.");
  }

  const { error: moveError } = await supabase
    .from("processos")
    .update({ kanban_column_id: target.id, updated_at: new Date().toISOString() })
    .eq("tenant_id", source.tenant_id)
    .eq("kanban_column_id", source.id);

  if (moveError) {
    throw new Error(moveError.message);
  }

  const { error: deleteError } = await supabase
    .from("process_kanban_columns")
    .update({ is_active: false })
    .eq("id", source.id);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  revalidatePath("/monitoramento");
}

export async function syncProcessDataJudNow(processId: string) {
  try {
    const apiKey = process.env.DATAJUD_API_KEY;
    if (!apiKey) return { ok: false as const, message: "DATAJUD_API_KEY não configurada no ambiente de produção." };
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };

    const { data: processRow, error } = await supabase
      .from("processos")
      .select("id, cnj, data_ultima_movimentacao, data_ultima_movimentacao_datajud")
      .eq("id", processId)
      .eq("tenant_id", profile.tenant_id)
      .single();
    if (error) throw new Error(`Falha ao localizar processo: ${error.message}`);
    if (!processRow) throw new Error("Processo não encontrado.");

    const result = await sincronizarProcessoDataJud(createServiceClient(), profile.tenant_id, processRow, apiKey);
    revalidatePath("/monitoramento");
    return { ok: true as const, ...result };
  } catch (error) {
    console.error("[monitoramento] sincronização DataJud falhou:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

export async function startTenantDataJudSyncJob() {
  try {
    if (!process.env.DATAJUD_API_KEY) return { ok: false as const, message: "DATAJUD_API_KEY não configurada no ambiente de produção." };
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };

    const { data: active } = await supabase
      .from("datajud_sync_jobs")
      .select("id")
      .eq("tenant_id", profile.tenant_id)
      .in("status", ["pending", "running"])
      .maybeSingle();
    if (active?.id) return { ok: true as const, jobId: active.id as string, resumed: true as const };

    const { count, error: countError } = await supabase
      .from("processos")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "ativo")
      .eq("nivel_sigilo", 0);
    if (countError) throw new Error(`Falha ao contar processos: ${countError.message}`);

    const { data: job, error } = await supabase
      .from("datajud_sync_jobs")
      .insert({ tenant_id: profile.tenant_id, requested_by: profile.id, total: count ?? 0 })
      .select("id")
      .single();
    if (error || !job) throw new Error(`Falha ao iniciar sincronização: ${error?.message ?? "job não criado"}`);
    return { ok: true as const, jobId: job.id as string, resumed: false as const };
  } catch (error) {
    console.error("[monitoramento] não foi possível iniciar job DataJud:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

export async function getTenantDataJudSyncJob(jobId?: string) {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };
  let query = supabase
    .from("datajud_sync_jobs")
    .select("id, status, total, processed, updated_count, unchanged_count, not_found_count, error_count, last_error, created_at, completed_at")
    .eq("tenant_id", profile.tenant_id);
  if (jobId) query = query.eq("id", jobId);
  else query = query.in("status", ["pending", "running"]);
  const { data, error } = await query.maybeSingle();
  if (error) return { ok: false as const, message: error.message };
  return { ok: true as const, job: data };
}

export type MuralSyncStatus = {
  status: "idle" | "syncing" | "error" | "never";
  lastSync?: { completedAt: string; recebidas: number; novas: number; erros: number };
  processing?: { oabNumber: string; oabUf: string; startedAt: string };
  errorMessage?: string;
};

/**
 * Lia de `cs_mural_requests` até 31/07/2026 — tabela órfã desde a
 * migração do Mural pra fila unificada (Fase 7 de
 * docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md): nada escreve mais
 * nela, então o card ficava preso mostrando o último registro de antes
 * da migração ("há 2d") mesmo com sincronizações reais acontecendo o dia
 * todo via `sync_tasks` (mural_push a cada 30min). Corrigido pra ler da
 * fonte certa.
 */
export async function getMuralSyncStatus(): Promise<MuralSyncStatus> {
  try {
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { status: "never" };

    // Checa se há algum pedido em processamento
    const { data: processing } = await supabase
      .from("sync_tasks")
      .select("cursor, started_at")
      .eq("tenant_id", profile.tenant_id)
      .eq("source", "mural")
      .eq("type", "mural_request")
      .in("status", ["claimed", "running"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (processing) {
      const cursor = processing.cursor as { oabNumber?: string; oabUf?: string } | null;
      return {
        status: "syncing",
        processing: {
          oabNumber: cursor?.oabNumber ?? "",
          oabUf: cursor?.oabUf ?? "",
          startedAt: processing.started_at ?? new Date().toISOString(),
        },
      };
    }

    // Busca o último completado
    const { data: last } = await supabase
      .from("sync_tasks")
      .select("status, counters, error_message, completed_at, created_at")
      .eq("tenant_id", profile.tenant_id)
      .eq("source", "mural")
      .eq("type", "mural_request")
      .in("status", ["completed", "completed_with_warnings", "failed"])
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!last) return { status: "never" };

    if (last.status === "failed") {
      return { status: "error", errorMessage: last.error_message || "Falha desconhecida" };
    }

    const counters = last.counters as { recebidas?: number; novas?: number; erros?: number } | null;
    return {
      status: "idle",
      lastSync: {
        completedAt: last.completed_at ?? last.created_at,
        recebidas: counters?.recebidas ?? 0,
        novas: counters?.novas ?? 0,
        erros: counters?.erros ?? 0,
      },
    };
  } catch {
    return { status: "never" };
  }
}

export async function syncTenantDataJudNow() {
  try {
    const apiKey = process.env.DATAJUD_API_KEY;
    if (!apiKey) return { ok: false as const, message: "DATAJUD_API_KEY não configurada no ambiente de produção." };
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };

    const { data: processes, error } = await supabase
      .from("processos")
      .select("id, cnj, data_ultima_movimentacao, data_ultima_movimentacao_datajud")
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "ativo")
      .eq("nivel_sigilo", 0);
    if (error) throw new Error(`Falha ao listar processos: ${error.message}`);

    const service = createServiceClient();
    const result = { processados: 0, atualizados: 0, sem_mudanca: 0, nao_encontrados: 0, erros: 0 };
    for (const process of processes ?? []) {
      try {
        const synced = await sincronizarProcessoDataJud(service, profile.tenant_id, process, apiKey);
        result.processados++;
        if (synced.status === "atualizado") result.atualizados++;
        if (synced.status === "sem_mudanca") result.sem_mudanca++;
        if (synced.status === "nao_encontrado") result.nao_encontrados++;
      } catch (error) {
        result.erros++;
        console.error(`[monitoramento] DataJud falhou para ${process.cnj}:`, error);
      }
    }
    revalidatePath("/monitoramento");
    return { ok: true as const, ...result };
  } catch (error) {
    console.error("[monitoramento] sincronização DataJud do escritório falhou:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

/**
 * Enfileira `mural_request` em `sync_tasks` — mesmo mecanismo do cron
 * `solicitar-mural` (Fase 7, fila unificada), só disparado na hora em vez
 * de esperar o cron. Antes disso (até 04/08/2026) inseria em
 * `cs_mural_requests`, tabela órfã desde a migração pra `sync_tasks` —
 * nada mais processa linha nova lá (`getMuralSyncStatus` acima já lê de
 * `sync_tasks` há tempos), então clicar em "Sincronizar agora" criava um
 * pedido que nunca rodava. O Sync que estiver online pega a tarefa
 * automaticamente no próximo poll de 30s, sem precisar de nada do lado do
 * CS.
 */
export async function startTenantMuralSyncNow() {
  try {
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuario sem escritorio vinculado." };

    const { data: oabs, error: oabsError } = await supabase
      .from("escritorio_oabs")
      .select("oab_number, oab_uf")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true);
    if (oabsError) throw new Error(`Falha ao listar OABs: ${oabsError.message}`);

    const now = new Date();
    const inicioJanela = new Date(now);
    inicioJanela.setMonth(inicioJanela.getMonth() - 12);
    const dataInicioStr = inicioJanela.toISOString().slice(0, 10);
    const dataFimStr = now.toISOString().slice(0, 10);

    let criados = 0;
    let pulados = 0;
    const batchId = randomUUID();

    for (const oab of oabs ?? []) {
      const { data: existente } = await supabase
        .from("sync_tasks")
        .select("id")
        .eq("tenant_id", profile.tenant_id)
        .eq("source", "mural")
        .eq("type", "mural_request")
        .contains("cursor", { oabNumber: oab.oab_number, oabUf: oab.oab_uf })
        .in("status", ["pending", "claimed", "running"])
        .limit(1)
        .maybeSingle();
      if (existente) {
        pulados++;
        continue;
      }

      const { error: insertError } = await supabase.from("sync_tasks").insert({
        tenant_id: profile.tenant_id,
        source: "mural",
        type: "mural_request",
        idempotency_key: `mural_request:${oab.oab_number}:${oab.oab_uf}:${dataInicioStr}`,
        priority: 1,
        cursor: { oabNumber: oab.oab_number, oabUf: oab.oab_uf, dataInicio: dataInicioStr, dataFim: dataFimStr },
        batch_id: batchId,
      });
      if (insertError) {
        if (insertError.code === "23505") pulados++;
        else throw new Error(`Falha ao enfileirar OAB ${oab.oab_number}/${oab.oab_uf}: ${insertError.message}`);
      } else {
        criados++;
      }
    }

    revalidatePath("/monitoramento");
    return { ok: true as const, criados, pulados, oabs: oabs?.length ?? 0 };
  } catch (error) {
    console.error("[monitoramento] nao foi possivel enfileirar sincronizacao do Mural:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

/**
 * Enfileira `pdpj_cnj` em `sync_tasks` pros processos mais desatualizados
 * do escritório — mesmo mecanismo do cron `poll-pdpj-detalhes`, só
 * disparado na hora em vez de esperar a janela horária. Prioridade 1 (mais
 * urgente que os 6 do cron de rotina) pra furar a fila na frente. Cap fixo
 * (não o cálculo por tempo restante do cron) porque aqui é uma Server
 * Action com orçamento de tempo bem mais curto — 100 inserts é rápido o
 * suficiente pra não estourar.
 */
export async function startTenantPdpjSyncNow() {
  try {
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuario sem escritorio vinculado." };

    const LOTE_MAXIMO = 100;
    const limiteAntiguidade = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const cnjsComTarefaAberta = await buscarCnjsComTarefaAberta(supabase, profile.tenant_id);
    const candidatos = await buscarProcessosCandidatosPdpj(supabase, profile.tenant_id, limiteAntiguidade);
    const pendentesReais = candidatos.filter((p) => !cnjsComTarefaAberta.has(p.cnj)).slice(0, LOTE_MAXIMO);

    if (pendentesReais.length === 0) {
      return { ok: true as const, criados: 0, pulados: 0 };
    }

    const dataHoje = new Date().toISOString().slice(0, 10);
    const batchId = randomUUID();
    let criados = 0;
    let pulados = 0;

    for (const processo of pendentesReais) {
      const { error: insertError } = await supabase.from("sync_tasks").insert({
        tenant_id: profile.tenant_id,
        source: "pdpj",
        type: "pdpj_cnj",
        idempotency_key: `pdpj_cnj:${processo.cnj}:${dataHoje}`,
        priority: 1,
        cnj: processo.cnj,
        processo_id: processo.id,
        batch_id: batchId,
      });
      if (insertError) {
        if (insertError.code === "23505") pulados++;
        else console.error(`[monitoramento] falha ao enfileirar CNJ ${processo.cnj}:`, insertError.message);
      } else {
        criados++;
      }
    }

    revalidatePath("/monitoramento");
    return { ok: true as const, criados, pulados };
  } catch (error) {
    console.error("[monitoramento] nao foi possivel enfileirar sincronizacao do PDPJ:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

export async function syncTenantDataJudBatch(offset = 0, batchSize = 3) {
  try {
    const apiKey = process.env.DATAJUD_API_KEY;
    if (!apiKey) return { ok: false as const, message: "DATAJUD_API_KEY não configurada no ambiente de produção." };
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };

    const safeOffset = Math.max(0, Math.floor(offset));
    const safeBatchSize = Math.min(5, Math.max(1, Math.floor(batchSize)));
    const { data: processes, count, error } = await supabase
      .from("processos")
      .select("id, cnj, data_ultima_movimentacao, data_ultima_movimentacao_datajud", { count: "exact" })
      .eq("tenant_id", profile.tenant_id)
      .eq("status", "ativo")
      .eq("nivel_sigilo", 0)
      .order("id", { ascending: true })
      .range(safeOffset, safeOffset + safeBatchSize - 1);
    if (error) throw new Error(`Falha ao listar processos: ${error.message}`);

    const result = { processados: 0, atualizados: 0, sem_mudanca: 0, nao_encontrados: 0, erros: 0 };
    const service = createServiceClient();
    for (const process of processes ?? []) {
      try {
        const synced = await sincronizarProcessoDataJud(service, profile.tenant_id, process, apiKey);
        result.processados++;
        if (synced.status === "atualizado") result.atualizados++;
        if (synced.status === "sem_mudanca") result.sem_mudanca++;
        if (synced.status === "nao_encontrado") result.nao_encontrados++;
      } catch (error) {
        result.erros++;
        console.error(`[monitoramento] DataJud falhou para ${process.cnj}:`, error);
      }
    }

    const nextOffset = safeOffset + (processes?.length ?? 0);
    const done = nextOffset >= (count ?? 0) || (processes?.length ?? 0) < safeBatchSize;
    if (done) revalidatePath("/monitoramento");
    return { ok: true as const, ...result, offset: safeOffset, nextOffset, total: count ?? 0, done };
  } catch (error) {
    console.error("[monitoramento] lote DataJud falhou:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

/**
 * Dispara uma consulta individual do Mural pra este processo — Fase 7 de
 * docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md. O Mural só é consultável
 * por OAB (não por CNJ direto), então isso cria uma tarefa `mural_request`
 * por OAB ativa do escritório, priorizada (a consulta individual do usuário
 * furando a fila normal do cron), marcada com `processo_id` pra rastreio.
 */
export async function syncProcessMuralNow(processId: string) {
  try {
    const { supabase, profile } = await requireAppUser();
    if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };
    const { data: process, error: processError } = await supabase
      .from("processos")
      .select("id, cnj")
      .eq("id", processId)
      .eq("tenant_id", profile.tenant_id)
      .single();
    if (processError) throw new Error(`Falha ao localizar processo: ${processError.message}`);
    if (!process) throw new Error("Processo não encontrado.");

    const service = createServiceClient();
    const { data: oabs, error: oabsError } = await service
      .from("escritorio_oabs")
      .select("oab_number, oab_uf")
      .eq("tenant_id", profile.tenant_id)
      .eq("is_active", true);
    if (oabsError) throw new Error(`Falha ao localizar OABs do escritório: ${oabsError.message}`);
    if (!oabs || oabs.length === 0) throw new Error("Nenhuma OAB ativa cadastrada neste escritório.");

    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 12);
    const dataInicio = start.toISOString().slice(0, 10);
    const dataFim = end.toISOString().slice(0, 10);
    const now = Date.now();

    const taskIds: string[] = [];
    for (const oab of oabs) {
      const { data: task, error: taskError } = await service
        .from("sync_tasks")
        .insert({
          tenant_id: profile.tenant_id,
          source: "mural",
          type: "mural_request",
          processo_id: process.id,
          priority: 2,
          idempotency_key: `mural_request_individual:${oab.oab_number}:${oab.oab_uf}:${process.id}:${now}`,
          cursor: { oabNumber: oab.oab_number, oabUf: oab.oab_uf, dataInicio, dataFim },
        })
        .select("id")
        .single();
      if (taskError || !task) throw new Error(`Não foi possível solicitar a consulta pelo CS: ${taskError?.message ?? "tarefa não criada"}`);
      taskIds.push(task.id as string);
    }

    return { ok: true as const, queued: true as const, requestId: taskIds[0] };
  } catch (error) {
    console.error("[monitoramento] sincronização Mural falhou:", error);
    return { ok: false as const, message: syncErrorMessage(error) };
  }
}

export async function getMuralSyncRequest(requestId: string) {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };
  const { data, error } = await supabase
    .from("sync_tasks")
    .select("id, status, error_message, completed_at, counters")
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (error) return { ok: false as const, message: error.message };
  if (!data) return { ok: false as const, message: "Solicitação de sincronização não encontrada." };
  const terminalOk = data.status === "completed" || data.status === "completed_with_warnings";
  const terminalFail = data.status === "failed" || data.status === "cancelled" || data.status === "paused_login_required" || data.status === "paused_rate_limit";
  const status: "pending" | "processing" | "completed" | "failed" = terminalOk ? "completed" : terminalFail ? "failed" : "processing";
  return { ok: true as const, status, result: data.counters, errorMessage: data.error_message };
}

/*
 * Removed demo-data action. Keep this block commented until the old test rows
 * are removed from the database with the dedicated cleanup SQL.
export async function createSampleProcesses() {
  const { supabase, profile, tenantId, redirectTenant } = await resolveSeedTenantId();

  const rows = demoProcesses.map((process, index) => {
    const [
      cnj,
      tribunal,
      grau,
      sistema,
      classeCodigo,
      classeNome,
      autor,
      reu,
      status,
      tags,
      valorCausa,
    ] = process;

    return {
      tenant_id: tenantId,
      cnj,
      tribunal,
      grau,
      sistema,
      classe_codigo: classeCodigo,
      classe_nome: classeNome,
      assuntos: tags.map((tag) => ({ nome: tag })),
      nivel_sigilo: (tags as readonly string[]).includes("sigiloso") ? 1 : 0,
      orgao_julgador: `${index + 1}ª Vara ${tribunal}`,
      autor,
      reu,
      advogados: [{ nome: profile.name, email: profile.email }],
      valor_causa: valorCausa,
      prazo_proxima_resposta: addDays((index % 9) + 2).toISOString().slice(0, 10),
      proxima_audiencia: index % 3 === 0 ? atHour((index % 10) + 1, 9 + (index % 6), index % 2 === 0 ? 0 : 30).toISOString() : null,
      status,
      tags,
      responsavel_id: profile.id,
      is_favorito: index % 5 === 0,
      data_ultima_movimentacao: addDays(-index).toISOString(),
      source_context: index % 4 === 0 ? "public" : "tenant",
      created_by: profile.id,
      updated_by: profile.id,
    };
  });

  const { data: processes, error } = await supabase
    .from("processos")
    .upsert(rows, { onConflict: "tenant_id,cnj" })
    .select("id, cnj, classe_nome, tribunal, proxima_audiencia, prazo_proxima_resposta");

  if (error) {
    redirect(`/monitoramento?error=${encodeURIComponent(error.message)}`);
  }

  const processRows = processes ?? [];
  const { data: existingDemoAgenda } = await supabase
    .from("agenda_eventos")
    .select("id")
    .eq("tenant_id", tenantId)
    .like("titulo", "[Demo]%")
    .limit(1);

  if (processRows.length > 0 && (existingDemoAgenda ?? []).length === 0) {
    await supabase.from("agenda_eventos").insert(
      processRows.slice(0, 10).flatMap((process, index) => {
        const events = [];
        if (process.proxima_audiencia) {
          events.push({
            tenant_id: tenantId,
            processo_id: process.id,
            user_id: profile.id,
            tipo: "audiencia",
            titulo: `[Demo] Audiencia - ${process.classe_nome}`,
            descricao: `Audiencia vinculada ao processo ${process.cnj}.`,
            data_inicio: process.proxima_audiencia,
            fonte: index % 2 === 0 ? "pje" : "manual",
            status: "pendente",
          });
        }

        if (process.prazo_proxima_resposta) {
          events.push({
            tenant_id: tenantId,
            processo_id: process.id,
            user_id: profile.id,
            tipo: "prazo",
            titulo: `[Demo] Prazo - ${process.tribunal}`,
            descricao: `Prazo interno de acompanhamento do processo ${process.cnj}.`,
            data_inicio: atHour(index + 1, 14 + (index % 4)).toISOString(),
            fonte: index % 3 === 0 ? "mural" : "manual",
            status: "pendente",
          });
        }

        return events;
      }),
    );
  }

  const { data: existingDemoMovement } = await supabase
    .from("movimentacoes")
    .select("id")
    .eq("tenant_id", tenantId)
    .like("nome", "[Demo]%")
    .limit(1);

  if (processRows.length > 0 && (existingDemoMovement ?? []).length === 0) {
    await supabase.from("movimentacoes").insert(
      processRows.map((process, index) => ({
        tenant_id: tenantId,
        processo_id: process.id,
        data_movimento: addDays(-index).toISOString(),
        codigo: 100 + index,
        nome: `[Demo] ${index % 2 === 0 ? "Juntada de peticao" : "Conclusos para decisao"}`,
        texto_completo: `Movimentacao de exemplo para testar o monitoramento do processo ${process.cnj}.`,
        fonte: index % 3 === 0 ? "datajud" : "manual",
        prazo_dias: index % 4 === 0 ? 5 : null,
        is_novo: index < 8,
      })),
    );
  }

  revalidatePath("/monitoramento");
  revalidatePath("/agenda");

  if (redirectTenant) {
    redirect(`/monitoramento?tenant=${tenantId}`);
  }
}
*/
