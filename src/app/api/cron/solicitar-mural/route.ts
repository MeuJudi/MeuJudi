// Cron: cria pedidos de consulta ao Mural para o CS.
// Roda periodicamente (a cada 6h via cron-job.org ou Vercel cron).
// Para cada OAB ativa do sistema, cria um cs_mural_requests que o CS
// vai pegar no próximo poll, buscar no PJe e devolver via /api/cs/sync/mural.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

/** Janela padrão: últimos 30 dias (se nunca sincronizou) */
const JANELA_PADRAO_DIAS = 30;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  // 1. Busca OABs ativas com tenant ativo
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

  let criados = 0;
  let pulados = 0;
  let erros = 0;

  const now = new Date();

  for (const oab of oabs) {
    try {
      // 2. Verifica se já existe pedido pendente/processing pra esta OAB
      const { data: existente } = await supabase
        .from("cs_mural_requests")
        .select("id")
        .eq("tenant_id", oab.tenant_id)
        .eq("oab_number", oab.oab_number)
        .eq("oab_uf", oab.oab_uf)
        .in("status", ["pending", "processing"])
        .limit(1)
        .maybeSingle();

      if (existente) {
        pulados++;
        continue;
      }

      // 3. Determina janela de datas
      // Último sync bem-sucedido desta OAB
      const { data: ultimoSync } = await supabase
        .from("cs_mural_requests")
        .select("completed_at")
        .eq("tenant_id", oab.tenant_id)
        .eq("oab_number", oab.oab_number)
        .eq("oab_uf", oab.oab_uf)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const dataInicio = ultimoSync?.completed_at
        ? new Date(ultimoSync.completed_at)
        : new Date(now.getTime() - JANELA_PADRAO_DIAS * 24 * 60 * 60 * 1000);

      // 4. Cria o pedido
      const { error: insertError } = await supabase
        .from("cs_mural_requests")
        .insert({
          tenant_id: oab.tenant_id,
          oab_number: oab.oab_number,
          oab_uf: oab.oab_uf,
          requested_by: null, // cron, não usuário
          data_inicio: dataInicio.toISOString().split("T")[0],
          data_fim: now.toISOString().split("T")[0],
          status: "pending",
        });

      if (insertError) {
        console.error(`[solicitar-mural] erro ao criar pedido OAB ${oab.oab_number}/${oab.oab_uf}:`, insertError.message);
        erros++;
      } else {
        criados++;
      }
    } catch (error) {
      console.error(`[solicitar-mural] erro inesperado OAB ${oab.oab_number}/${oab.oab_uf}:`, error);
      erros++;
    }
  }

  console.log(`[solicitar-mural] concluído: ${criados} criados, ${pulados} pulados, ${erros} erros, ${oabs.length} OABs total`);

  return NextResponse.json({
    oabs_total: oabs.length,
    criados,
    pulados,
    erros,
  });
}
