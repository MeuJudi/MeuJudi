// Cron: descobre processos novos via Mural Eletrônico, por OAB (Sprint 2).
// Ao contrário do DataJud (1 chamada = 1 processo já conhecido), aqui 1
// chamada por OAB devolve uma LISTA de comunicações — é isso que permite
// descoberta automática. "Distribuição multi-tenant": agrupa
// escritorio_oabs por (oab_number, oab_uf) ANTES de consultar, então uma
// mesma OAB compartilhada por 2 tenants gera só 1 chamada à API, com o
// resultado distribuído pra cada tenant que a tem cadastrada. Segue o mesmo
// padrão de auth/estrutura de src/app/api/cron/processar-fila-lote/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { MuralClient, type MuralComunicacao } from "@/lib/mural/client";
import { extrairPrazoDias, extrairPrazoHoras, extrairAudienciaV2 } from "@/lib/regex/patterns";
import { calcularPrazoFatal } from "@/lib/prazo/calcular-prazo-fatal";
import { extrairCampo } from "@/lib/extracao/pipeline";
import { sugerirVinculoCliente, type PoloParte } from "@/lib/clientes/sugestao-vinculo";
import type { SupabaseClient } from "@supabase/supabase-js";

const JANELA_DIAS = 7;

function poloParaPt(polo: string): PoloParte | null {
  if (polo === "A") return "autor";
  if (polo === "P") return "reu";
  return null;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const mural = new MuralClient();

  const { data: oabs, error: oabsError } = await supabase
    .from("escritorio_oabs")
    .select("tenant_id, oab_number, oab_uf, tenants!inner(is_active)")
    .eq("is_active", true)
    .eq("tenants.is_active", true);

  if (oabsError) {
    return NextResponse.json({ error: oabsError.message }, { status: 500 });
  }

  // Agrupa por (oab_number, oab_uf) — distribuição multi-tenant: 1 chamada por
  // OAB única, resultado replicado pra cada tenant que a tem cadastrada.
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
            console.error(`[poll-mural] Erro comunicação ${com.id} / tenant ${tenantId}:`, err instanceof Error ? err.message : err);
          }
        }
      }

      resultado.oabs_processadas++;
    } catch (err) {
      resultado.erros++;
      console.error(`[poll-mural] Erro OAB ${chave}:`, err instanceof Error ? err.message : err);
    }

    // Pausa entre OABs (mesmo cuidado do doc original — não martelar a API pública).
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  await supabase.from("motor_extracao_log").insert({
    tipo: "poll_mural_finalizado",
    detalhes: resultado,
  });

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

async function processarComunicacao(
  supabase: SupabaseClient,
  tenantId: string,
  com: MuralComunicacao,
): Promise<boolean> {
  const { data: existente } = await supabase
    .from("comunicacoes_mural")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("mural_id", com.id)
    .maybeSingle();

  if (existente) return false;

  let processoId: string;
  let processoNovo = false;

  const { data: processo } = await supabase
    .from("processos")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("cnj", com.numero_processo)
    .maybeSingle();

  if (processo) {
    processoId = processo.id;
  } else {
    const { data: novoProcesso, error: criarError } = await supabase
      .from("processos")
      .insert({
        tenant_id: tenantId,
        cnj: com.numero_processo,
        tribunal: com.siglaTribunal?.toLowerCase() ?? null,
        classe_codigo: com.codigoClasse ? parseInt(com.codigoClasse) : null,
        classe_nome: com.nomeClasse ?? null,
        status: "ativo",
        ultima_sync_mural: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (criarError || !novoProcesso) {
      throw new Error(`Falha ao criar processo ${com.numero_processo}: ${criarError?.message}`);
    }
    processoId = novoProcesso.id;
    processoNovo = true;
  }

  const prazoDias = extrairPrazoDias(com.texto);
  const prazoHoras = extrairPrazoHoras(com.texto);
  const audiencia = extrairAudienciaV2(com.texto);
  const dataAudienciaIso = audiencia?.data_iso ?? null;

  if (!prazoDias && !dataAudienciaIso) {
    // Regex simples não achou nada — motor completo decide (sem sinal de
    // urgência conhecido, cai pra fila de lote por padrão, como no DataJud).
    await extrairCampo(supabase, {
      tenantId,
      processoId,
      texto: com.texto,
      campo: "prazo",
      tribunal: com.siglaTribunal ?? "",
      contextoProcesso: { classe: com.nomeClasse ?? "", tribunal: com.siglaTribunal ?? "", tipo: com.tipoComunicacao ?? "" },
      contextoUrgencia: { prazoDiasDetectado: null, dataAudienciaDetectada: null },
    });
  }

  const dataFatal = prazoDias ? calcularPrazoFatal(new Date(com.data_disponibilizacao), prazoDias) : null;

  await supabase.from("comunicacoes_mural").insert({
    tenant_id: tenantId,
    processo_id: processoId,
    mural_id: com.id,
    data_disponibilizacao: com.data_disponibilizacao,
    sigla_tribunal: com.siglaTribunal,
    tipo_comunicacao: com.tipoComunicacao,
    nome_orgao: com.nomeOrgao,
    texto: com.texto,
    meio: com.meio,
    link_processo: com.link,
    destinatarios: com.destinatarios,
    advogados: com.destinatarioadvogados?.map((d) => ({
      nome: d.advogado.nome,
      oab: d.advogado.numero_oab,
      uf: d.advogado.uf_oab,
    })),
    prazo_dias: prazoDias,
    prazo_horas: prazoHoras,
    data_prazo_fatal: dataFatal,
    data_audiencia: dataAudienciaIso,
  });

  const autor = com.destinatarios?.find((d) => d.polo === "A")?.nome ?? null;
  const reu = com.destinatarios?.find((d) => d.polo === "P")?.nome ?? null;

  await supabase
    .from("processos")
    .update({
      ...(autor ? { autor } : {}),
      ...(reu ? { reu } : {}),
      advogados: com.destinatarioadvogados?.map((d) => ({
        nome: d.advogado.nome,
        oab: d.advogado.numero_oab,
        uf: d.advogado.uf_oab,
      })),
      ...(dataAudienciaIso ? { proxima_audiencia: dataAudienciaIso } : {}),
      ...(dataFatal ? { prazo_proxima_resposta: dataFatal } : {}),
      ultima_sync_mural: new Date().toISOString(),
    })
    .eq("id", processoId);

  if (dataAudienciaIso) {
    await supabase.from("agenda_eventos").insert({
      tenant_id: tenantId,
      processo_id: processoId,
      tipo: "audiencia",
      titulo: `${com.tipoComunicacao} - ${com.siglaTribunal}`,
      descricao: com.nomeOrgao,
      data_inicio: dataAudienciaIso,
      fonte: "mural",
      fonte_id: String(com.id),
    });
  }

  if (dataFatal) {
    await supabase.from("agenda_eventos").insert({
      tenant_id: tenantId,
      processo_id: processoId,
      tipo: "prazo",
      titulo: `Prazo: ${prazoDias} dias`,
      descricao: com.tipoComunicacao,
      data_inicio: dataFatal,
      fonte: "mural",
      fonte_id: String(com.id),
    });
  }

  if (processoNovo) {
    const nomesVistos = new Set<string>();
    for (const destinatario of com.destinatarios ?? []) {
      const polo = poloParaPt(destinatario.polo);
      const nome = destinatario.nome?.trim();
      if (!polo || !nome || nomesVistos.has(nome)) continue;
      nomesVistos.add(nome);
      await sugerirVinculoCliente(supabase, tenantId, processoId, nome, polo);
    }
  }

  return true;
}
