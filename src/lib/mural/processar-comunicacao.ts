import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuralComunicacao } from "./client";
import { converterValorMonetario, extrairAudienciaV2, extrairPrazoDias, extrairPrazoHoras, extrairValor } from "@/lib/regex/patterns";
import { calcularPrazoFatal } from "@/lib/prazo/calcular-prazo-fatal";
import { extrairCampo } from "@/lib/extracao/pipeline";
import { detectarSinalFracoDeUrgencia } from "@/lib/extracao/detectar-sinal-urgencia";
import { sugerirVinculoCliente, type PoloParte } from "@/lib/clientes/sugestao-vinculo";
import { registrarAdvogadosDoMural } from "./advogados-diretorio";
import { extrairMetadadosMural } from "./extrair-metadados";

function poloParaPt(polo: string): PoloParte | null {
  if (polo === "A") return "autor";
  if (polo === "P") return "reu";
  return null;
}

export async function processarComunicacao(supabase: SupabaseClient, tenantId: string, com: MuralComunicacao): Promise<boolean> {
  const { data: existente } = await supabase
    .from("comunicacoes_mural")
    .select("id, processo_id, texto, valor_causa_extraido")
    .eq("tenant_id", tenantId)
    .eq("mural_id", com.id)
    .maybeSingle();
  if (existente) {
    // Reprocessa somente o campo determinístico que pode ter sido perdido em
    // importações antigas. Não reabre a comunicação nem sobrescreve valores
    // já confirmados no processo.
    const valorCausa = converterValorMonetario(extrairValor(existente.texto));
    const metadados = extrairMetadadosMural(existente.texto);
    if (valorCausa != null && existente.processo_id) {
      if (existente.valor_causa_extraido == null) {
        await supabase.from("comunicacoes_mural").update({ valor_causa_extraido: valorCausa }).eq("id", existente.id).eq("tenant_id", tenantId);
      }
      await supabase.from("processos").update({ valor_causa: valorCausa }).eq("id", existente.processo_id).eq("tenant_id", tenantId).is("valor_causa", null);
    }
    if (existente.processo_id && (metadados.magistradoNome || metadados.orgaoJulgador)) {
      if (metadados.orgaoJulgador) {
        await supabase.from("processos").update({ orgao_julgador: metadados.orgaoJulgador }).eq("id", existente.processo_id).eq("tenant_id", tenantId).is("orgao_julgador", null);
      }
      if (metadados.magistradoNome) {
        await supabase.from("processos").update({ magistrado_nome: metadados.magistradoNome, magistrado_tipo: metadados.magistradoTipo }).eq("id", existente.processo_id).eq("tenant_id", tenantId).is("magistrado_nome", null);
      }
      await supabase.from("comunicacoes_mural").update({
        ...(metadados.magistradoNome ? { magistrado_nome: metadados.magistradoNome, magistrado_tipo: metadados.magistradoTipo } : {}),
      }).eq("id", existente.id).eq("tenant_id", tenantId);
    }
    return false;
  }

  let processoId: string;
  let processoNovo = false;
  const { data: processo } = await supabase
    .from("processos")
    .select("id, data_ultima_movimentacao, valor_causa, orgao_julgador, magistrado_nome")
    .eq("tenant_id", tenantId)
    .eq("cnj", com.numero_processo)
    .maybeSingle();
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
  // O valor da causa é um dado estruturado simples: Regex determinística
  // resolve o formato explícito do Mural sem consumir IA.
  const valorCausa = converterValorMonetario(extrairValor(com.texto));
  const metadados = extrairMetadadosMural(com.texto);
  const orgaoJulgador = com.nomeOrgao?.trim() || metadados.orgaoJulgador;
  const dataAudienciaIso = audiencia?.data_iso ?? null;
  if (!prazoDias && !dataAudienciaIso) {
    // Sinal fraco de urgência evita que texto com chance real de ser urgente
    // caia direto na fila de lote (achado 02 da auditoria de 23/07/2026).
    await extrairCampo(supabase, {
      tenantId, processoId, texto: com.texto, campo: "prazo", tribunal: com.siglaTribunal ?? "",
      contextoProcesso: { classe: com.nomeClasse ?? "", tribunal: com.siglaTribunal ?? "", tipo: com.tipoComunicacao ?? "" },
      contextoUrgencia: {
        prazoDiasDetectado: null,
        dataAudienciaDetectada: null,
        sinalFracoDeUrgencia: detectarSinalFracoDeUrgencia(com.texto, com.tipoComunicacao),
      },
    });
  }

  const dataFatal = prazoDias ? calcularPrazoFatal(new Date(com.data_disponibilizacao), prazoDias) : null;
  const { error: comunicacaoError } = await supabase.from("comunicacoes_mural").insert({
    tenant_id: tenantId, processo_id: processoId, mural_id: com.id, data_disponibilizacao: com.data_disponibilizacao,
    sigla_tribunal: com.siglaTribunal, tipo_comunicacao: com.tipoComunicacao, nome_orgao: com.nomeOrgao, texto: com.texto,
    meio: com.meio, link_processo: com.link, destinatarios: com.destinatarios,
    advogados: com.destinatarioadvogados?.map((d) => ({
      nome: d.advogado.nome,
      oab: d.advogado.numero_oab,
      uf: d.advogado.uf_oab,
      ...(d.advogado.principal !== undefined ? { principal: d.advogado.principal } : {}),
      ...(d.advogado.is_principal !== undefined ? { is_principal: d.advogado.is_principal } : {}),
      ...(d.advogado.representante_principal !== undefined ? { representante_principal: d.advogado.representante_principal } : {}),
      ...(d.advogado.tipo ? { tipo: d.advogado.tipo } : {}),
    })),
    prazo_dias: prazoDias, prazo_horas: prazoHoras, data_prazo_fatal: dataFatal, data_audiencia: dataAudienciaIso,
    valor_causa_extraido: valorCausa,
    magistrado_nome: metadados.magistradoNome,
    magistrado_tipo: metadados.magistradoTipo,
  });
  if (comunicacaoError) throw new Error(`Falha ao salvar comunicacao ${com.id}: ${comunicacaoError.message}`);

  try {
    await registrarAdvogadosDoMural(supabase, tenantId, com.id, com.siglaTribunal, com.destinatarioadvogados);
  } catch (error) {
    console.error(`[mural] Falha ao atualizar diretorio de advogados para ${com.id}:`, error);
  }

  const autor = com.destinatarios?.find((d) => d.polo === "A")?.nome ?? null;
  const reu = com.destinatarios?.find((d) => d.polo === "P")?.nome ?? null;
  const { error: processoError } = await supabase.from("processos").update({
    ...(autor ? { autor } : {}), ...(reu ? { reu } : {}),
    advogados: com.destinatarioadvogados?.map((d) => ({
      nome: d.advogado.nome,
      oab: d.advogado.numero_oab,
      uf: d.advogado.uf_oab,
      ...(d.advogado.principal !== undefined ? { principal: d.advogado.principal } : {}),
      ...(d.advogado.is_principal !== undefined ? { is_principal: d.advogado.is_principal } : {}),
      ...(d.advogado.representante_principal !== undefined ? { representante_principal: d.advogado.representante_principal } : {}),
      ...(d.advogado.tipo ? { tipo: d.advogado.tipo } : {}),
    })),
    ...(com.siglaTribunal ? { tribunal: com.siglaTribunal.toLowerCase() } : {}),
    ...(com.codigoClasse ? { classe_codigo: parseInt(com.codigoClasse) } : {}),
    ...(com.nomeClasse ? { classe_nome: com.nomeClasse } : {}),
    ...(orgaoJulgador && processo?.orgao_julgador == null ? { orgao_julgador: orgaoJulgador } : {}),
    ...(metadados.magistradoNome && processo?.magistrado_nome == null ? {
      magistrado_nome: metadados.magistradoNome,
      magistrado_tipo: metadados.magistradoTipo,
    } : {}),
    // Não sobrescreve um valor confirmado pelo DataJud ou pelo usuário.
    ...(valorCausa != null && processo?.valor_causa == null ? { valor_causa: valorCausa } : {}),
    ...(dataAudienciaIso ? { proxima_audiencia: dataAudienciaIso } : {}),
    ...(dataFatal ? { prazo_proxima_resposta: dataFatal } : {}),
    data_ultima_movimentacao: processo?.data_ultima_movimentacao && new Date(processo.data_ultima_movimentacao) > new Date(com.data_disponibilizacao)
      ? processo.data_ultima_movimentacao
      : com.data_disponibilizacao,
    ultima_sync_mural: new Date().toISOString(),
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
