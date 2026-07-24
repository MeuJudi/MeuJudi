// Cron: verifica os batches enviados, coleta resultados prontos, e agora
// FECHA o loop que antes deixava o resultado preso em
// fila_processamento_lote.resultado pra sempre (achado 01 da auditoria de
// 23/07/2026 — ver docs/roadmap/auditoria-motor-extracao/01-fila-lote-beco-sem-saida.md).
// Confiança alta aplica direto no processo/agenda; o resto vira item na
// Central de Revisão — nunca mais fica só um registro morto na tabela.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { extrairJSON } from "@/lib/ia/json-utils";
import { aplicarPrazoEncontrado, aplicarAudienciaEncontrada } from "@/lib/prazo/aplicar-prazo";
import { criarItemRevisao } from "@/lib/extracao/central-revisao";
import type { ContextoProcesso } from "@/lib/ia/prompts";
import type { CampoExtraido, NivelConfianca } from "@/lib/ia/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Sem isso a Vercel mata a função no timeout padrão (curto no Hobby) antes
// de terminar — ver poll-datajud/route.ts.
export const maxDuration = 60;

interface ItemFila {
  id: string;
  tenant_id: string;
  processo_id: string | null;
  campo: CampoExtraido;
  texto: string;
  contexto: ContextoProcesso | null;
  created_at: string;
}

interface ResultadoLotePrazo {
  prazo_dias: number | null;
  prazo_horas: number | null;
  data_audiencia: string | null;
  fundamento_legal: string | null;
  confianca: NivelConfianca;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // Filtra tenant ativo + liberado (Fase 1 da validação de OAB) — se o
  // tenant deixou de estar liberado entre o envio e a coleta, o item fica
  // parado em "enviado_batch" até ele voltar a ficar liberado.
  const { data: emAndamento } = await supabase
    .from("fila_processamento_lote")
    .select("id, tenant_id, processo_id, campo, texto, contexto, created_at, batch_id_anthropic, tenants!inner(is_active, access_status)")
    .eq("status", "enviado_batch")
    .not("batch_id_anthropic", "is", null)
    .eq("tenants.is_active", true)
    .eq("tenants.access_status", "liberado")
    .returns<Array<ItemFila & { batch_id_anthropic: string }>>();

  const itensPorId = new Map((emAndamento ?? []).map((item) => [item.id, item]));
  const batchIds = [...new Set((emAndamento ?? []).map((r) => r.batch_id_anthropic))];

  const resultado = { batches_verificados: 0, itens_processados: 0, itens_aplicados: 0, itens_viraram_revisao: 0, itens_com_erro: 0 };

  for (const batchId of batchIds) {
    const batch = await anthropic.messages.batches.retrieve(batchId);
    if (batch.processing_status !== "ended") continue;
    resultado.batches_verificados++;

    const resultadosBatch = await anthropic.messages.batches.results(batchId);
    for await (const itemResultado of resultadosBatch) {
      const item = itensPorId.get(itemResultado.custom_id);
      if (!item) continue; // linha não encontrada na consulta inicial — não deveria acontecer

      let textoResposta: string | null = null;
      if (itemResultado.result.type === "succeeded") {
        const bloco = itemResultado.result.message.content[0];
        textoResposta = bloco?.type === "text" ? bloco.text : null;
      }

      let resultadoParseado: ResultadoLotePrazo | null = null;
      if (textoResposta) {
        try {
          resultadoParseado = extrairJSON<ResultadoLotePrazo>(textoResposta);
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
        .eq("id", item.id);

      resultado.itens_processados++;

      if (!resultadoParseado || !item.processo_id) {
        if (!resultadoParseado) resultado.itens_com_erro++;
        continue;
      }

      try {
        const achouAlgo = resultadoParseado.prazo_dias != null || resultadoParseado.data_audiencia != null;

        if (resultadoParseado.confianca === "alta" && achouAlgo) {
          if (resultadoParseado.prazo_dias != null) {
            await aplicarPrazoEncontrado(supabase, {
              tenantId: item.tenant_id,
              processoId: item.processo_id,
              prazoDias: resultadoParseado.prazo_dias,
              // fila_processamento_lote não guarda a data original da
              // movimentação/comunicação — usa o momento em que o caso foi
              // enfileirado (o poller enfileira logo depois de detectar),
              // que é a melhor aproximação disponível hoje.
              dataReferencia: new Date(item.created_at),
              fonte: "fila_lote",
              fonteId: item.id,
              descricao: item.contexto?.tipo ?? null,
            });
          }
          if (resultadoParseado.data_audiencia) {
            await aplicarAudienciaEncontrada(supabase, {
              tenantId: item.tenant_id,
              processoId: item.processo_id,
              dataAudienciaIso: resultadoParseado.data_audiencia,
              fonte: "fila_lote",
              fonteId: item.id,
              descricao: item.contexto?.tipo ?? null,
            });
          }
          resultado.itens_aplicados++;
        } else {
          await criarItemRevisao(supabase, {
            tenantId: item.tenant_id,
            processoId: item.processo_id,
            campo: item.campo,
            tribunalOrigem: item.contexto?.tribunal ?? "desconhecido",
            textoOriginal: item.texto,
            resultado: {
              origem: "ia_generalista",
              valor: resultadoParseado,
              confianca: resultadoParseado.confianca,
              precisaRevisaoHumana: true,
            },
          });
          resultado.itens_viraram_revisao++;
        }
      } catch (err) {
        resultado.itens_com_erro++;
        console.error(`[coletar-resultados-lote] Erro aplicando resultado do item ${item.id}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  try {
    await supabase.from("motor_extracao_log").insert({
      tipo: "coletar_resultados_lote_finalizado",
      detalhes: resultado,
    });
  } catch (logErr) {
    console.error("[coletar-resultados-lote] Falha ao registrar log:", logErr instanceof Error ? logErr.message : logErr);
  }

  return NextResponse.json(resultado);
}
