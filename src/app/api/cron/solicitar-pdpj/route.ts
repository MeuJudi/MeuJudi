// Cron: cria tarefas de varredura do Portal PDPJ por OAB (fila unificada
// sync_tasks — ver docs/roadmap/24-crons-sincronizacao-automatica-pdpj.md,
// Cron 1). Mesmo papel que solicitar-mural/route.ts tem pro Mural: só
// descobre processo NOVO, nunca atualiza processo já existente (isso é
// papel do Cron 2/3, poll-pdpj-detalhes/poll-pdpj-urgentes).
//
// Roda a cada 6h. A tarefa-mãe pdpj_oab tem dedup por "balde" de 6h (a
// mesma OAB não gera 2 tarefas dentro da mesma janela, mesmo que o cron
// dispare mais de uma vez nela por retry externo). O CS pareado varre a
// OAB inteira e cria as tarefas-filha pdpj_cnj automaticamente
// (meujudi-cs/src/main/pdpj-tasks.ts::handlePdpjOab), sem mudança aqui.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

/** Baldes de 6h, alinhados à meia-noite UTC: 00, 06, 12, 18. */
function baldeSeisHoras(data: Date): string {
  const hora = Math.floor(data.getUTCHours() / 6) * 6;
  const dia = data.toISOString().slice(0, 10);
  return `${dia}T${String(hora).padStart(2, "0")}`;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: oabs, error: oabsError } = await supabase
    .from("escritorio_oabs")
    .select("tenant_id, oab_number, oab_uf, tenants!inner(is_active, access_status)")
    .eq("is_active", true)
    .eq("tenants.is_active", true)
    .eq("tenants.access_status", "liberado");

  if (oabsError) return NextResponse.json({ error: oabsError.message }, { status: 500 });
  if (!oabs || oabs.length === 0) {
    return NextResponse.json({ criados: 0, motivo: "nenhuma_oab_ativa" });
  }

  const balde = baldeSeisHoras(new Date());
  let criados = 0;
  let pulados = 0;
  let erros = 0;

  for (const oab of oabs) {
    try {
      const { error: insertError } = await supabase.from("sync_tasks").insert({
        tenant_id: oab.tenant_id,
        source: "pdpj",
        type: "pdpj_oab",
        idempotency_key: `pdpj_oab:${oab.oab_number}:${oab.oab_uf}:${balde}`,
        priority: 5,
        cursor: { oabNumber: oab.oab_number, oabUf: oab.oab_uf },
      });

      if (insertError) {
        if (insertError.code === "23505") {
          pulados++;
        } else {
          console.error(`[solicitar-pdpj] erro ao criar tarefa OAB ${oab.oab_number}/${oab.oab_uf}:`, insertError.message);
          erros++;
        }
      } else {
        criados++;
      }
    } catch (error) {
      console.error(`[solicitar-pdpj] erro inesperado OAB ${oab.oab_number}/${oab.oab_uf}:`, error);
      erros++;
    }
  }

  console.log(`[solicitar-pdpj] concluído: ${criados} criados, ${pulados} pulados, ${erros} erros, ${oabs.length} OABs total`);

  return NextResponse.json({ oabs_total: oabs.length, criados, pulados, erros });
}
