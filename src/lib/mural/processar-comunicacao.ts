import type { SupabaseClient } from "@supabase/supabase-js";
import type { MuralComunicacao } from "./client";
import { converterValorMonetario, extrairAudienciaV2, extrairLinkVideoconferencia, extrairNaturezaPrazo, extrairPrazoDias, extrairPrazoHoras, extrairValor, normalizarTipoAudiencia } from "@/lib/regex/patterns";
import { aplicarAudienciaEncontrada, aplicarPrazoEncontrado } from "@/lib/prazo/aplicar-prazo";
import { calcularPrazoFatal } from "@/lib/prazo/calcular-prazo-fatal";
import { extrairCampo } from "@/lib/extracao/pipeline";
import { detectarSinalFracoDeUrgencia } from "@/lib/extracao/detectar-sinal-urgencia";
import { sugerirVinculoCliente, type PoloParte } from "@/lib/clientes/sugestao-vinculo";
import { registrarAdvogadosDoMural } from "./advogados-diretorio";
import { extrairMetadadosMural } from "./extrair-metadados";
import { normalizarTribunalSigla } from "@/lib/tribunais/normalizar";
import { vincularProcessoAoCatalogo } from "@/lib/tribunais/reconciliar-cobertura";

function poloParaPt(polo: string): PoloParte | null {
  if (polo === "A") return "autor";
  if (polo === "P") return "reu";
  return null;
}

/** Mantém o catálogo id_orgao -> nome atualizado — não é por tenant, é global (mesmo id no PJe inteiro). Falha aqui não derruba o processamento da comunicação. */
async function registrarOrgaoMural(supabase: SupabaseClient, com: MuralComunicacao): Promise<void> {
  if (com.idOrgao == null || !com.nomeOrgao) return;
  try {
    await supabase.from("mural_orgaos").upsert(
      { id_orgao: com.idOrgao, nome: com.nomeOrgao, sigla_tribunal: normalizarTribunalSigla(com.siglaTribunal) ?? com.siglaTribunal, atualizado_em: new Date().toISOString() },
      { onConflict: "id_orgao" },
    );
  } catch (error) {
    console.error(`[mural] falha ao registrar orgao ${com.idOrgao}:`, error);
  }
}

export async function processarComunicacao(supabase: SupabaseClient, tenantId: string, com: MuralComunicacao): Promise<boolean> {
  await registrarOrgaoMural(supabase, com);

  const { data: existente } = await supabase
    .from("comunicacoes_mural")
    .select("id, processo_id, texto, valor_causa_extraido, data_audiencia, prazo_dias, data_prazo_fatal, link_videoconferencia, data_cancelamento")
    .eq("tenant_id", tenantId)
    .eq("mural_id", com.id)
    .maybeSingle();
  if (existente) {
    // Comunicação já importada foi cancelada/retificada depois — só
    // registra pra visibilidade (não reverte prazo/audiência já aplicado
    // na Agenda automaticamente; nunca visto acontecer de verdade ainda,
    // ver comentário da migração).
    if (!existente.data_cancelamento && (com.ativo === false || com.data_cancelamento)) {
      await supabase.from("comunicacoes_mural").update({
        ativo: com.ativo ?? false,
        data_cancelamento: com.data_cancelamento ?? new Date().toISOString(),
        motivo_cancelamento: com.motivo_cancelamento ?? null,
      }).eq("id", existente.id).eq("tenant_id", tenantId);
      console.warn(`[mural] comunicacao ${com.id} cancelada apos ja processada (processo_id=${existente.processo_id ?? "?"})`);
    }
    // Reprocessa campos determinísticos que podem ter sido perdidos em
    // importações antigas (ex: regexes que não limpavam HTML). Não reabre
    // a comunicação nem sobrescreve valores já confirmados no processo.
    const valorCausa = converterValorMonetario(extrairValor(existente.texto));
    const metadados = extrairMetadadosMural(existente.texto);

    // Link de videoconferência: extração nova (24/07/2026) — comunicações
    // já importadas antes dela nunca tiveram chance de ter esse campo
    // preenchido, então reprocessa independente do estado de prazo/audiência.
    if (existente.link_videoconferencia == null) {
      const linkExistente = extrairLinkVideoconferencia(existente.texto);
      if (linkExistente) {
        await supabase.from("comunicacoes_mural").update({ link_videoconferencia: linkExistente }).eq("id", existente.id).eq("tenant_id", tenantId);
        if (existente.data_audiencia) {
          // Já tinha audiência aplicada antes do link existir — atualiza só
          // o link no evento de agenda correspondente, sem reabrir mais nada.
          await supabase.from("agenda_eventos").update({ link_videoconferencia: linkExistente })
            .eq("tenant_id", tenantId).eq("fonte", "mural").eq("fonte_id", String(com.id));
        }
      }
    }
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
    if (existente.processo_id) await vincularProcessoAoCatalogo(supabase, existente.processo_id, com.siglaTribunal, "mural");
    // Re-extrai audiência/prazo se os campos estiverem vazios — corrige
    // importações antigas onde regexes não limpavam HTML do Mural.
    if (existente.processo_id) {
      const precisaReextrair = !existente.data_audiencia && !existente.prazo_dias;
      if (precisaReextrair) {
        const novaAudiencia = extrairAudienciaV2(existente.texto);
        const novoPrazoDias = extrairPrazoDias(existente.texto);
        const novoPrazoHoras = extrairPrazoHoras(existente.texto);
        const dataAudienciaIso = novaAudiencia?.data_iso ?? null;
        const dataFatal = novoPrazoDias ? calcularPrazoFatal(new Date(com.data_disponibilizacao), novoPrazoDias) : null;

        if (dataAudienciaIso || novoPrazoDias) {
          const updateCom: Record<string, unknown> = {};
          if (dataAudienciaIso) updateCom.data_audiencia = dataAudienciaIso;
          if (novoPrazoDias) { updateCom.prazo_dias = novoPrazoDias; updateCom.prazo_horas = novoPrazoHoras; }
          if (dataFatal) updateCom.data_prazo_fatal = dataFatal;
          await supabase.from("comunicacoes_mural").update(updateCom).eq("id", existente.id).eq("tenant_id", tenantId);

          const updateProc: Record<string, unknown> = {};
          if (dataAudienciaIso) updateProc.proxima_audiencia = dataAudienciaIso;
          if (dataFatal) updateProc.prazo_proxima_resposta = dataFatal;
          await supabase.from("processos").update(updateProc).eq("id", existente.processo_id).eq("tenant_id", tenantId);

          if (dataAudienciaIso) {
            await aplicarAudienciaEncontrada(supabase, {
              tenantId, processoId: existente.processo_id, dataAudienciaIso,
              fonte: "mural", fonteId: String(com.id),
              titulo: `${com.tipoComunicacao} - ${com.siglaTribunal}`, descricao: com.nomeOrgao,
              tipoAudiencia: normalizarTipoAudiencia(novaAudiencia?.tipo, novaAudiencia?.texto_completo),
              extracaoOrigem: "regex_reprocessada", extracaoConfianca: "alta", textoOrigem: com.texto,
              linkVideoconferencia: extrairLinkVideoconferencia(existente.texto),
            });
          }
          if (novoPrazoDias) {
            await aplicarPrazoEncontrado(supabase, {
              tenantId, processoId: existente.processo_id, prazoDias: novoPrazoDias,
              dataReferencia: new Date(com.data_disponibilizacao),
              fonte: "mural", fonteId: String(com.id), descricao: com.tipoComunicacao,
              naturezaPrazo: extrairNaturezaPrazo(existente.texto),
              extracaoOrigem: "regex_reprocessada", extracaoConfianca: "alta", textoOrigem: com.texto,
            });
          }
          console.log(`[mural] re-extração ${com.id}: audi=${dataAudienciaIso ?? "-"} prazo=${novoPrazoDias ?? "-"}`);
        }
      }
    }
    return false;
  }

  let processoId: string;
  const { data: processo } = await supabase
    .from("processos")
    .select("id, data_ultima_movimentacao, valor_causa, orgao_julgador, magistrado_nome, data_ultima_comunicacao_mural")
    .eq("tenant_id", tenantId)
    .eq("cnj", com.numero_processo)
    .maybeSingle();
  if (processo) {
    processoId = processo.id;
  } else {
    const { data: novoProcesso, error } = await supabase.from("processos").insert({
      tenant_id: tenantId,
      cnj: com.numero_processo,
      tribunal: normalizarTribunalSigla(com.siglaTribunal),
      classe_codigo: com.codigoClasse ? parseInt(com.codigoClasse) : null,
      classe_nome: com.nomeClasse ?? null,
      status: "ativo",
      ultima_sync_mural: new Date().toISOString(),
    }).select("id").single();
    if (error) {
      // 23505 = unique_violation (tenant_id, cnj) — mesma corrida que o
      // PDPJ já trata (ver src/app/api/cs/sync/pdpj/route.ts): PDPJ e
      // Mural podem descobrir o mesmo CNJ quase ao mesmo tempo (mais
      // provável ainda logo que uma OAB nova é cadastrada, quando os dois
      // varrem ela pela primeira vez no mesmo ciclo). Antes essa corrida
      // subia como exceção não tratada aqui; agora recupera o id já
      // criado pela outra fonte em vez de derrubar a tarefa inteira.
      if (error.code === "23505") {
        const { data: refetched } = await supabase
          .from("processos")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("cnj", com.numero_processo)
          .maybeSingle();
        if (!refetched) throw new Error(`Corrida ao criar processo ${com.numero_processo}, mas não achou a linha existente: ${error.message}`);
        processoId = refetched.id;
      } else {
        throw new Error(`Falha ao criar processo ${com.numero_processo}: ${error.message}`);
      }
    } else if (novoProcesso) {
      processoId = novoProcesso.id;
    } else {
      throw new Error(`Falha ao criar processo ${com.numero_processo}: insert não retornou id.`);
    }
  }

  const prazoDias = extrairPrazoDias(com.texto);
  const prazoHoras = extrairPrazoHoras(com.texto);
  const audiencia = extrairAudienciaV2(com.texto);
  const linkVideoconferencia = extrairLinkVideoconferencia(com.texto);
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

  // Comunicação já vem cancelada/retificada do PJe — não aplica prazo nem
  // audiência na Agenda a partir dela (mas ainda salva a linha, pra
  // registro). Nunca visto acontecer de verdade na amostra testada
  // (31/07/2026), mas o campo existe no schema da API, então trata.
  const estaCancelada = com.ativo === false || Boolean(com.data_cancelamento);

  const dataFatal = prazoDias ? calcularPrazoFatal(new Date(com.data_disponibilizacao), prazoDias) : null;
  const { error: comunicacaoError } = await supabase.from("comunicacoes_mural").insert({
    tenant_id: tenantId, processo_id: processoId, mural_id: com.id, data_disponibilizacao: com.data_disponibilizacao,
    sigla_tribunal: normalizarTribunalSigla(com.siglaTribunal) ?? com.siglaTribunal, tipo_comunicacao: com.tipoComunicacao, tipo_documento: com.tipoDocumento ?? null,
    nome_orgao: com.nomeOrgao, id_orgao: com.idOrgao ?? null, texto: com.texto,
    ativo: com.ativo ?? true, status_comunicacao: com.status ?? null, data_cancelamento: com.data_cancelamento ?? null, motivo_cancelamento: com.motivo_cancelamento ?? null,
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
    link_videoconferencia: linkVideoconferencia,
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
    ...(com.siglaTribunal ? { tribunal: normalizarTribunalSigla(com.siglaTribunal) } : {}),
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
    data_ultima_comunicacao_mural: processo?.data_ultima_comunicacao_mural && new Date(processo.data_ultima_comunicacao_mural) > new Date(com.data_disponibilizacao)
      ? processo.data_ultima_comunicacao_mural
      : com.data_disponibilizacao,
    ultima_sync_mural: new Date().toISOString(),
  }).eq("id", processoId).eq("tenant_id", tenantId);
  if (processoError) throw new Error(`Falha ao atualizar processo ${processoId}: ${processoError.message}`);
  await vincularProcessoAoCatalogo(supabase, processoId, com.siglaTribunal, "mural");

  if (dataAudienciaIso && !estaCancelada) await aplicarAudienciaEncontrada(supabase, {
    tenantId,
    processoId,
    dataAudienciaIso,
    fonte: "mural",
    fonteId: String(com.id),
    titulo: `${com.tipoComunicacao} - ${com.siglaTribunal}`,
    descricao: com.nomeOrgao,
    tipoAudiencia: normalizarTipoAudiencia(audiencia?.tipo, audiencia?.texto_completo),
    extracaoOrigem: "regex",
    extracaoConfianca: "alta",
    textoOrigem: com.texto,
    linkVideoconferencia,
  });
  if (prazoDias && !estaCancelada) await aplicarPrazoEncontrado(supabase, {
    tenantId,
    processoId,
    prazoDias,
    dataReferencia: new Date(com.data_disponibilizacao),
    fonte: "mural",
    fonteId: String(com.id),
    descricao: com.tipoComunicacao,
    naturezaPrazo: extrairNaturezaPrazo(com.texto),
    extracaoOrigem: "regex",
    extracaoConfianca: "alta",
    textoOrigem: com.texto,
  });

  {
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
