import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuralComunicacao } from "./client";
import { extrairPrazoDias, extrairPrazoHoras, extrairAudienciaV2 } from "@/lib/regex/patterns";
import { calcularPrazoFatal } from "@/lib/prazo/calcular-prazo-fatal";
import { extrairCampo } from "@/lib/extracao/pipeline";
import { sugerirVinculoCliente, type PoloParte } from "@/lib/clientes/sugestao-vinculo";

function poloParaPt(polo: string): PoloParte | null {
  if (polo === "A") return "autor";
  if (polo === "P") return "reu";
  return null;
}

export async function processarComunicacao(supabase: SupabaseClient, tenantId: string, com: MuralComunicacao): Promise<boolean> {
  const { data: existente } = await supabase.from("comunicacoes_mural").select("id").eq("tenant_id", tenantId).eq("mural_id", com.id).maybeSingle();
  if (existente) return false;

  let processoId: string;
  let processoNovo = false;
  const { data: processo } = await supabase.from("processos").select("id").eq("tenant_id", tenantId).eq("cnj", com.numero_processo).maybeSingle();
  if (processo) {
    processoId = processo.id;
  } else {
    const { data: novoProcesso, error } = await supabase.from("processos").insert({
      tenant_id: tenantId,
      cnj: com.numero_processo,
      tribunal: com.siglaTribunal?.toLowerCase() ?? null,
      classe_codigo: com.codigoClasse ? parseInt(com.codigoClasse) : null,
      classe_nome: com.nomeClasse ?? null,
      status: "ativo",
      ultima_sync_mural: new Date().toISOString(),
    }).select("id").single();
    if (error || !novoProcesso) throw new Error(`Falha ao criar processo ${com.numero_processo}: ${error?.message}`);
    processoId = novoProcesso.id;
    processoNovo = true;
  }

  const prazoDias = extrairPrazoDias(com.texto);
  const prazoHoras = extrairPrazoHoras(com.texto);
  const audiencia = extrairAudienciaV2(com.texto);
  const dataAudienciaIso = audiencia?.data_iso ?? null;
  if (!prazoDias && !dataAudienciaIso) {
    await extrairCampo(supabase, {
      tenantId, processoId, texto: com.texto, campo: "prazo", tribunal: com.siglaTribunal ?? "",
      contextoProcesso: { classe: com.nomeClasse ?? "", tribunal: com.siglaTribunal ?? "", tipo: com.tipoComunicacao ?? "" },
      contextoUrgencia: { prazoDiasDetectado: null, dataAudienciaDetectada: null },
    });
  }

  const dataFatal = prazoDias ? calcularPrazoFatal(new Date(com.data_disponibilizacao), prazoDias) : null;
  const { error: comunicacaoError } = await supabase.from("comunicacoes_mural").insert({
    tenant_id: tenantId, processo_id: processoId, mural_id: com.id, data_disponibilizacao: com.data_disponibilizacao,
    sigla_tribunal: com.siglaTribunal, tipo_comunicacao: com.tipoComunicacao, nome_orgao: com.nomeOrgao, texto: com.texto,
    meio: com.meio, link_processo: com.link, destinatarios: com.destinatarios,
    advogados: com.destinatarioadvogados?.map((d) => ({ nome: d.advogado.nome, oab: d.advogado.numero_oab, uf: d.advogado.uf_oab })),
    prazo_dias: prazoDias, prazo_horas: prazoHoras, data_prazo_fatal: dataFatal, data_audiencia: dataAudienciaIso,
  });
  if (comunicacaoError) throw new Error(`Falha ao salvar comunicacao ${com.id}: ${comunicacaoError.message}`);

  const autor = com.destinatarios?.find((d) => d.polo === "A")?.nome ?? null;
  const reu = com.destinatarios?.find((d) => d.polo === "P")?.nome ?? null;
  const { error: processoError } = await supabase.from("processos").update({
    ...(autor ? { autor } : {}), ...(reu ? { reu } : {}),
    advogados: com.destinatarioadvogados?.map((d) => ({ nome: d.advogado.nome, oab: d.advogado.numero_oab, uf: d.advogado.uf_oab })),
    ...(dataAudienciaIso ? { proxima_audiencia: dataAudienciaIso } : {}),
    ...(dataFatal ? { prazo_proxima_resposta: dataFatal } : {}), ultima_sync_mural: new Date().toISOString(),
  }).eq("id", processoId).eq("tenant_id", tenantId);
  if (processoError) throw new Error(`Falha ao atualizar processo ${processoId}: ${processoError.message}`);

  if (dataAudienciaIso) await supabase.from("agenda_eventos").upsert({ tenant_id: tenantId, processo_id: processoId, tipo: "audiencia", titulo: `${com.tipoComunicacao} - ${com.siglaTribunal}`, descricao: com.nomeOrgao, data_inicio: dataAudienciaIso, fonte: "mural", fonte_id: String(com.id) }, { onConflict: "tenant_id,fonte,fonte_id" });
  if (dataFatal) await supabase.from("agenda_eventos").upsert({ tenant_id: tenantId, processo_id: processoId, tipo: "prazo", titulo: `Prazo: ${prazoDias} dias`, descricao: com.tipoComunicacao, data_inicio: dataFatal, fonte: "mural", fonte_id: String(com.id) }, { onConflict: "tenant_id,fonte,fonte_id" });

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
