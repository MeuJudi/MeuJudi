// Cron: descobre processos novos via Mural Eletronico, por OAB.
// A mesma regra de persistencia tambem e usada pela sincronizacao do CS.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MuralClient, type MuralComunicacao } from "@/lib/mural/client";
import { processarComunicacao } from "@/lib/mural/processar-comunicacao";

// Sem isso a Vercel mata a função no timeout padrão (curto no Hobby) antes
// de terminar de varrer todas as OABs — ver poll-datajud/route.ts.
export const maxDuration = 60;

const JANELA_DIAS = 7;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const mural = new MuralClient();
  const { data: oabs, error: oabsError } = await supabase
    .from("escritorio_oabs")
    .select("tenant_id, oab_number, oab_uf, tenants!inner(is_active, access_status)")
    .eq("is_active", true)
    .eq("tenants.is_active", true)
    .eq("tenants.access_status", "liberado");

  if (oabsError) return NextResponse.json({ error: oabsError.message }, { status: 500 });

  const tenantsPorOab = new Map<string, Set<string>>();
  for (const row of oabs ?? []) {
    const chave = `${row.oab_number}/${row.oab_uf}`;
    if (!tenantsPorOab.has(chave)) tenantsPorOab.set(chave, new Set());
    tenantsPorOab.get(chave)!.add(row.tenant_id as string);
  }

  const hoje = new Date();
  const inicioJanela = new Date(hoje);
  inicioJanela.setDate(hoje.getDate() - JANELA_DIAS);
  const dataInicio = inicioJanela.toISOString().split("T")[0];
  const dataFim = hoje.toISOString().split("T")[0];
  const resultado = { oabs_processadas: 0, comunicacoes_novas: 0, comunicacoes_puladas: 0, erros: 0 };

  for (const [chave, tenantIds] of tenantsPorOab) {
    const [oabNumber, oabUf] = chave.split("/");
    try {
      const comunicacoes = await buscarTodasPaginas(mural, oabNumber, oabUf, dataInicio, dataFim);
      for (const com of comunicacoes) {
        for (const tenantId of tenantIds) {
          try {
            const novo = await processarComunicacao(supabase, tenantId, com);
            if (novo) resultado.comunicacoes_novas++;
            else resultado.comunicacoes_puladas++;
          } catch (err) {
            resultado.erros++;
            console.error(`[poll-mural] Erro comunicacao ${com.id} / tenant ${tenantId}:`, err instanceof Error ? err.message : err);
          }
        }
      }
      resultado.oabs_processadas++;
    } catch (err) {
      resultado.erros++;
      console.error(`[poll-mural] Erro OAB ${chave}:`, err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await supabase.from("motor_extracao_log").insert({ tipo: "poll_mural_finalizado", detalhes: resultado });
  return NextResponse.json(resultado);
}

async function buscarTodasPaginas(
  mural: MuralClient,
  oab: string,
  uf: string,
  dataInicio: string,
  dataFim: string,
): Promise<MuralComunicacao[]> {
  const itensPorPagina = 100;
  const items: MuralComunicacao[] = [];
  let pagina = 1;

  while (true) {
    const resposta = await mural.buscarPorOAB(oab, uf, dataInicio, dataFim, pagina, itensPorPagina);
    if (!resposta.items || resposta.items.length === 0) break;
    items.push(...resposta.items);
    if (resposta.items.length < itensPorPagina) break;
    pagina++;
  }
  return items;
}
