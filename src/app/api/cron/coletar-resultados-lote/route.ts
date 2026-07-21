// Cron: verifica os batches enviados e coleta resultados prontos (Parte 9).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { extrairJSON } from "@/lib/ia/json-utils";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: emAndamento } = await supabase
    .from("fila_processamento_lote")
    .select("batch_id_anthropic")
    .eq("status", "enviado_batch")
    .not("batch_id_anthropic", "is", null);

  const batchIds = [...new Set((emAndamento ?? []).map((r) => r.batch_id_anthropic as string))];
  let itensProcessados = 0;

  for (const batchId of batchIds) {
    const batch = await anthropic.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") continue;

    const resultados = await anthropic.messages.batches.results(batchId);
    for await (const resultado of resultados) {
      let textoResposta: string | null = null;
      if (resultado.result.type === "succeeded") {
        const bloco = resultado.result.message.content[0];
        textoResposta = bloco?.type === "text" ? bloco.text : null;
      }

      let resultadoParseado: unknown = null;
      if (textoResposta) {
        try {
          resultadoParseado = extrairJSON(textoResposta);
        } catch {
          textoResposta = null; // marca como erro abaixo se não conseguiu parsear
        }
      }

      await supabase
        .from("fila_processamento_lote")
        .update({
          status: resultadoParseado ? "processado" : "erro",
          resultado: resultadoParseado,
          processado_em: new Date().toISOString(),
        })
        .eq("id", resultado.custom_id);

      itensProcessados++;
    }
  }

  return NextResponse.json({ batches_verificados: batchIds.length, itens_processados: itensProcessados });
}
