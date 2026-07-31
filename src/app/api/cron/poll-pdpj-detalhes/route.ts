// Cron: mantém processos já conhecidos atualizados no Portal PDPJ (fila
// unificada sync_tasks — ver docs/roadmap/24-crons-sincronizacao-
// automatica-pdpj.md, Cron 2). Nunca descobre processo novo (isso é papel
// do Cron 1, solicitar-pdpj) — só reescaneia quem já existe.
//
// Roda de hora em hora, das 9h às 16h (Brasília). Ritmo adaptativo: cada
// disparo calcula quantos processos estão pendentes e divide pelas horas
// restantes até 16h, pra terminar o "rodízio do dia" sem estourar tudo de
// uma vez nem deixar sobra. Se não tem pendente, não faz nada nesse tenant.

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

const HORA_INICIO = 9;
const HORA_FIM = 16;
const DIAS_PARA_REESCANEAR = 7;

// Estados que NÃO bloqueiam recriar a tarefa — só o que ainda está "em
// aberto" conta como já coberto. Sem essa exclusão, um CS offline por mais
// de 1 dia faz o cron empilhar uma tarefa nova pro mesmo CNJ a cada
// disparo (ultima_sync_pdpj só muda quando a tarefa CONCLUI, não quando é
// criada) — descoberto ao revisar a lógica com o Caio, 30/07/2026.
const STATUS_ABERTOS = ["pending", "claimed", "running", "waiting_external", "paused_login_required", "paused_rate_limit"];

function horaAtualBrasilia(): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10);
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const horaAtual = horaAtualBrasilia();
  if (horaAtual < HORA_INICIO || horaAtual > HORA_FIM) {
    return NextResponse.json({ motivo: "fora_da_janela", horaAtual });
  }

  const supabase = createServiceClient();

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id")
    .eq("is_active", true)
    .eq("access_status", "liberado");

  if (tenantsError) return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ criados: 0, motivo: "nenhum_tenant_liberado" });
  }

  const horasRestantes = HORA_FIM - horaAtual + 1;
  const dataHoje = new Date().toISOString().slice(0, 10);
  const limiteAntiguidade = new Date(Date.now() - DIAS_PARA_REESCANEAR * 24 * 60 * 60 * 1000).toISOString();

  let criadosTotal = 0;
  let pulados = 0;
  const porTenant: Record<string, number> = {};

  for (const tenant of tenants) {
    try {
      const { data: tarefasAbertas } = await supabase
        .from("sync_tasks")
        .select("cnj")
        .eq("tenant_id", tenant.id)
        .eq("source", "pdpj")
        .eq("type", "pdpj_cnj")
        .in("status", STATUS_ABERTOS)
        .not("cnj", "is", null);
      const cnjsComTarefaAberta = [...new Set((tarefasAbertas ?? []).map((t) => t.cnj as string))];
      // PostgREST exige a lista entre parênteses pro operador "not in".
      const filtroCnjAberto = cnjsComTarefaAberta.length > 0 ? `(${cnjsComTarefaAberta.join(",")})` : null;

      let queryPendentes = supabase
        .from("processos")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenant.id)
        .eq("status", "ativo")
        .is("pdpj_acesso_negado_em", null)
        .or(`ultima_sync_pdpj.is.null,ultima_sync_pdpj.lt.${limiteAntiguidade}`);
      if (filtroCnjAberto) queryPendentes = queryPendentes.not("cnj", "in", filtroCnjAberto);
      const { count: pendentes } = await queryPendentes;

      if (!pendentes || pendentes === 0) continue;

      const loteDeHoje = Math.min(pendentes, Math.ceil(pendentes / horasRestantes));
      // Um id só por tenant nesta execução — agrupa as tarefas criadas
      // agora como "um lote" na tela de fila do CS (ver
      // sync_tasks_batches no banco). Puramente visual, não afeta claim.
      const batchId = randomUUID();

      let querySelecao = supabase
        .from("processos")
        .select("id, cnj")
        .eq("tenant_id", tenant.id)
        .eq("status", "ativo")
        .is("pdpj_acesso_negado_em", null)
        .or(`ultima_sync_pdpj.is.null,ultima_sync_pdpj.lt.${limiteAntiguidade}`)
        .order("ultima_sync_pdpj", { ascending: true, nullsFirst: true })
        .limit(loteDeHoje);
      if (filtroCnjAberto) querySelecao = querySelecao.not("cnj", "in", filtroCnjAberto);
      const { data: processos } = await querySelecao;

      let criadosTenant = 0;
      for (const processo of processos ?? []) {
        const { error: insertError } = await supabase.from("sync_tasks").insert({
          tenant_id: tenant.id,
          source: "pdpj",
          type: "pdpj_cnj",
          idempotency_key: `pdpj_cnj:${processo.cnj}:${dataHoje}`,
          priority: 6,
          cnj: processo.cnj,
          processo_id: processo.id,
          batch_id: batchId,
        });
        if (insertError) {
          if (insertError.code === "23505") pulados++;
          else console.error(`[poll-pdpj-detalhes] erro ao criar tarefa CNJ ${processo.cnj}:`, insertError.message);
        } else {
          criadosTenant++;
        }
      }

      criadosTotal += criadosTenant;
      porTenant[tenant.id] = criadosTenant;
    } catch (error) {
      console.error(`[poll-pdpj-detalhes] erro inesperado tenant ${tenant.id}:`, error);
    }
  }

  console.log(`[poll-pdpj-detalhes] concluído: ${criadosTotal} criados, ${pulados} pulados, hora=${horaAtual}, horasRestantes=${horasRestantes}`);

  return NextResponse.json({ criados: criadosTotal, pulados, hora: horaAtual, horasRestantes, porTenant });
}
