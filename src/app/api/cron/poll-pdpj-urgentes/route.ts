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

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 30;

const DIAS_DE_ANTECEDENCIA = 3;

// Mesmo motivo do poll-pdpj-detalhes: sem isso, CS offline por mais de 1
// dia faz esse cron empilhar tarefa nova pro mesmo CNJ urgente a cada dia
// (idempotency key com data só bloqueia dentro do mesmo dia).
const STATUS_ABERTOS = ["pending", "claimed", "running", "waiting_external", "paused_login_required", "paused_rate_limit"];

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
      const filtroCnjAberto = cnjsComTarefaAberta.length > 0 ? `(${cnjsComTarefaAberta.join(",")})` : null;

      let queryProcessos = supabase
        .from("processos")
        .select("id, cnj")
        .eq("tenant_id", tenant.id)
        .eq("status", "ativo")
        .or(`prazo_proxima_resposta.lte.${limiteFuturo},proxima_audiencia.lte.${limiteFuturo}`);
      if (filtroCnjAberto) queryProcessos = queryProcessos.not("cnj", "in", filtroCnjAberto);
      const { data: processos } = await queryProcessos;

      for (const processo of processos ?? []) {
        const { error: insertError } = await supabase.from("sync_tasks").insert({
          tenant_id: tenant.id,
          source: "pdpj",
          type: "pdpj_cnj",
          idempotency_key: `pdpj_cnj:${processo.cnj}:${dataHoje}`,
          priority: 2,
          cnj: processo.cnj,
          processo_id: processo.id,
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

  console.log(`[poll-pdpj-urgentes] concluído: ${criadosTotal} criados, ${pulados} pulados`);

  return NextResponse.json({ criados: criadosTotal, pulados });
}
