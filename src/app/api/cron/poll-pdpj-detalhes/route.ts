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
import { buscarCnjsComTarefaAberta, buscarProcessosCandidatosPdpj, desduplicarTarefasAbertasPdpj } from "@/lib/tribunais/pdpj-tarefas-abertas";

export const maxDuration = 60;

const HORA_INICIO = 9;
const HORA_FIM = 16;
const DIAS_PARA_REESCANEAR = 7;

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
  let duplicatasCanceladas = 0;
  const porTenant: Record<string, number> = {};

  for (const tenant of tenants) {
    try {
      // Rede de segurança: limpa duplicata de tarefa aberta pro mesmo CNJ
      // ANTES de decidir o que falta criar — achado 03/08/2026 (ver
      // pdpj-tarefas-abertas.ts pro histórico completo do bug).
      const dedup = await desduplicarTarefasAbertasPdpj(supabase, tenant.id);
      duplicatasCanceladas += dedup.tarefasCanceladas;
      if (dedup.tarefasCanceladas > 0) {
        console.log(`[poll-pdpj-detalhes] tenant ${tenant.id}: ${dedup.tarefasCanceladas} tarefa(s) duplicada(s) canceladas em ${dedup.cnjsComDuplicata} CNJ(s)`);
      }

      const cnjsComTarefaAberta = await buscarCnjsComTarefaAberta(supabase, tenant.id);
      const candidatos = await buscarProcessosCandidatosPdpj(supabase, tenant.id, limiteAntiguidade);
      const pendentesReais = candidatos.filter((p) => !cnjsComTarefaAberta.has(p.cnj));

      if (pendentesReais.length === 0) continue;

      const loteDeHoje = Math.min(pendentesReais.length, Math.ceil(pendentesReais.length / horasRestantes));
      // Um id só por tenant nesta execução — agrupa as tarefas criadas
      // agora como "um lote" na tela de fila do CS (ver
      // sync_tasks_batches no banco). Puramente visual, não afeta claim.
      const batchId = randomUUID();
      const processos = pendentesReais.slice(0, loteDeHoje);

      let criadosTenant = 0;
      for (const processo of processos) {
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

  console.log(`[poll-pdpj-detalhes] concluído: ${criadosTotal} criados, ${pulados} pulados, ${duplicatasCanceladas} duplicatas canceladas, hora=${horaAtual}, horasRestantes=${horasRestantes}`);

  return NextResponse.json({ criados: criadosTotal, pulados, duplicatasCanceladas, hora: horaAtual, horasRestantes, porTenant });
}
