// Cron: fila prioritária do PDPJ pra processo com prazo ou audiência perto
// (fila unificada sync_tasks — ver docs/roadmap/24-crons-sincronizacao-
// automatica-pdpj.md, Cron 3). Mesma atualização que o Cron 2
// (poll-pdpj-detalhes) faz, só que restrita a um grupo pequeno e sensível
// a tempo, sem esperar o rodízio geral.
//
// Roda a cada 15min, o dia todo (sem janela de horário — prazo não escolhe
// hora). Usa a MESMA idempotency_key com data que o Cron 2 usa
// (pdpj_cnj:{cnj}:{data}) — se o Cron 2 já reescaneou esse processo hoje, a
// tentativa daqui simplesmente colide (23505) e é ignorada, sem duplicar.

import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buscarCnjsComTarefaAberta, desduplicarTarefasAbertasPdpj } from "@/lib/tribunais/pdpj-tarefas-abertas";

export const maxDuration = 30;

const DIAS_DE_ANTECEDENCIA = 3;
const PAGE_SIZE = 1000;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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

  const dataHoje = new Date().toISOString().slice(0, 10);
  const limiteFuturo = new Date(Date.now() + DIAS_DE_ANTECEDENCIA * 24 * 60 * 60 * 1000).toISOString();

  let criadosTotal = 0;
  let pulados = 0;
  let duplicatasCanceladas = 0;

  for (const tenant of tenants) {
    try {
      // Mesma rede de segurança do poll-pdpj-detalhes (ver
      // pdpj-tarefas-abertas.ts) — roda aqui também porque este cron cria
      // tarefa independente do Cron 2.
      const dedup = await desduplicarTarefasAbertasPdpj(supabase, tenant.id);
      duplicatasCanceladas += dedup.tarefasCanceladas;

      const cnjsComTarefaAberta = await buscarCnjsComTarefaAberta(supabase, tenant.id);

      // Grupo pequeno por natureza (só quem tem prazo/audiência perto) —
      // mas pagina do mesmo jeito, por segurança, caso o escritório tenha
      // um volume grande de urgências ao mesmo tempo.
      const candidatos: { id: string; cnj: string }[] = [];
      const { getProcessIdsForTenant } = await import("@/lib/processos/helpers");
      const processoIds = await getProcessIdsForTenant(supabase, tenant.id);
      if (processoIds.length === 0) break;
      let offset = 0;
      while (true) {
        const batch = processoIds.slice(offset, offset + PAGE_SIZE);
        if (batch.length === 0) break;
        const { data, error } = await supabase
          .from("processos")
          .select("id, cnj")
          .in("id", batch)
          .eq("status", "ativo")
          .is("pdpj_acesso_negado_em", null)
          .or(`prazo_proxima_resposta.lte.${limiteFuturo},proxima_audiencia.lte.${limiteFuturo}`);
        if (error) throw new Error(`Falha ao buscar processos urgentes: ${error.message}`);
        for (const row of data ?? []) {
          if (row.cnj) candidatos.push({ id: row.id as string, cnj: row.cnj as string });
        }
        if (!data || data.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }

      const processos = candidatos.filter((p) => !cnjsComTarefaAberta.has(p.cnj));
      if (processos.length === 0) continue;

      // Um id só por tenant nesta execução — agrupa na tela de fila do CS.
      const batchId = randomUUID();
      for (const processo of processos) {
        const { error: insertError } = await supabase.from("sync_tasks").insert({
          tenant_id: tenant.id,
          source: "pdpj",
          type: "pdpj_cnj",
          idempotency_key: `pdpj_cnj:${processo.cnj}:${dataHoje}`,
          priority: 2,
          cnj: processo.cnj,
          processo_id: processo.id,
          batch_id: batchId,
        });
        if (insertError) {
          if (insertError.code === "23505") pulados++;
          else console.error(`[poll-pdpj-urgentes] erro ao criar tarefa CNJ ${processo.cnj}:`, insertError.message);
        } else {
          criadosTotal++;
        }
      }
    } catch (error) {
      console.error(`[poll-pdpj-urgentes] erro inesperado tenant ${tenant.id}:`, error);
    }
  }

  console.log(`[poll-pdpj-urgentes] concluído: ${criadosTotal} criados, ${pulados} pulados, ${duplicatasCanceladas} duplicatas canceladas`);

  return NextResponse.json({ criados: criadosTotal, pulados, duplicatasCanceladas });
}
