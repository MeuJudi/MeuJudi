"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireWritableAppUser as requireAppUser } from "@/lib/auth/guards";
import { sincronizarProcessoDataJud } from "@/lib/datajud/sincronizar-processo";
import { MuralClient, type MuralComunicacao } from "@/lib/mural/client";
import { processarComunicacao } from "@/lib/mural/processar-comunicacao";

const allowedStatuses = ["ativo", "suspenso", "arquivado", "concluido"] as const;
const columnColors = ["#9a6a22", "#4b6b4e", "#7a2e2e", "#2563eb", "#7c3aed", "#0e7490"];

/*
 * The monitoramento screen intentionally has no demo-data action. Real process
 * data must come from the tenant workflow, CS/PJe, DataJud or Mural.
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
  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) throw new Error("DATAJUD_API_KEY nao configurada.");
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) throw new Error("Usuario sem escritorio.");

  const { data: processRow, error } = await supabase
    .from("processos")
    .select("id, cnj, data_ultima_movimentacao")
    .eq("id", processId)
    .eq("tenant_id", profile.tenant_id)
    .single();
  if (error || !processRow) throw new Error("Processo nao encontrado.");

  const result = await sincronizarProcessoDataJud(supabase, profile.tenant_id, processRow, apiKey);
  revalidatePath("/monitoramento");
  return result;
}

export async function syncTenantDataJudNow() {
  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) throw new Error("DATAJUD_API_KEY nao configurada.");
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) throw new Error("Usuario sem escritorio.");

  const { data: processes, error } = await supabase
    .from("processos")
    .select("id, cnj, data_ultima_movimentacao")
    .eq("tenant_id", profile.tenant_id)
    .eq("status", "ativo")
    .eq("nivel_sigilo", 0);
  if (error) throw new Error(error.message);

  const result = { processados: 0, atualizados: 0, sem_mudanca: 0, nao_encontrados: 0, erros: 0 };
  for (const process of processes ?? []) {
    try {
      const synced = await sincronizarProcessoDataJud(supabase, profile.tenant_id, process, apiKey);
      result.processados++;
      if (synced.status === "atualizado") result.atualizados++;
      if (synced.status === "sem_mudanca") result.sem_mudanca++;
      if (synced.status === "nao_encontrado") result.nao_encontrados++;
    } catch {
      result.erros++;
    }
  }
  revalidatePath("/monitoramento");
  return result;
}

export async function syncProcessMuralNow(processId: string) {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) throw new Error("Usuario sem escritorio.");
  const { data: process, error: processError } = await supabase
    .from("processos")
    .select("id, cnj")
    .eq("id", processId)
    .eq("tenant_id", profile.tenant_id)
    .single();
  if (processError || !process) throw new Error("Processo nao encontrado.");

  const { data: oabs, error: oabError } = await supabase
    .from("escritorio_oabs")
    .select("oab_number, oab_uf")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true);
  if (oabError) throw new Error(oabError.message);
  if (!oabs?.length) throw new Error("Nenhuma OAB ativa cadastrada no escritorio.");

  const mural = new MuralClient();
  const end = new Date();
  const start = new Date(end);
  start.setMonth(start.getMonth() - 12);
  const targetCnj = process.cnj.replace(/\D/g, "");
  const seen = new Set<number>();
  let recebidas = 0;
  let novas = 0;

  for (const oab of oabs) {
    for (let page = 1; page <= 200; page++) {
      const response = await mural.buscarPorOAB(oab.oab_number, oab.oab_uf, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), page, 100);
      const items = response.items ?? [];
      recebidas += items.length;
      for (const item of items.filter((candidate) => candidate.numero_processo.replace(/\D/g, "") === targetCnj)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (await processarComunicacao(supabase, profile.tenant_id, item)) novas++;
      }
      if (items.length < 100) break;
    }
  }

  revalidatePath("/monitoramento");
  return { recebidas, encontradas: seen.size, novas };
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
