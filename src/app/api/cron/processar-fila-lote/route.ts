// Cron: envia os itens pendentes da fila de lote (Parte 9) pra Batch API da
// Anthropic. Protegido por CRON_SECRET (novo neste projeto — não existia
// nenhuma rota de cron ainda no MeuJudi web).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { PROMPTS } from "@/lib/ia/prompts";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: pendentes, error } = await supabase
    .from("fila_processamento_lote")
    .select("*")
    .eq("status", "pendente")
    .limit(1000); // Batch API aceita até 10k requests por batch — 1000 é um lote conservador inicial

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pendentes || pendentes.length === 0) {
    return NextResponse.json({ processados: 0 });
  }

  const requests = pendentes.map((item) => ({
    custom_id: item.id as string,
    params: {
      model: "claude-sonnet-5",
      max_tokens: 2048,
      messages: [
        {
          role: "user" as const,
          content: PROMPTS.extrairPrazo(item.texto, item.contexto as { classe: string; tribunal: string; tipo: string }),
        },
      ],
    },
  }));

  const batch = await anthropic.messages.batches.create({ requests });

  await supabase
    .from("fila_processamento_lote")
    .update({ status: "enviado_batch", batch_id_anthropic: batch.id })
    .in(
      "id",
      pendentes.map((p) => p.id),
    );

  return NextResponse.json({ processados: pendentes.length, batch_id: batch.id });
}
