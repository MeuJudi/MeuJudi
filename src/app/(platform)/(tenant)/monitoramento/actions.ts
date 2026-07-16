"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth/guards";

const allowedStatuses = ["ativo", "suspenso", "arquivado", "concluido"] as const;

const demoProcesses = [
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
}

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
