import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autenticarDevice } from "@/lib/cs/device-auth";
import { extrairDocumentoPdpj } from "@/lib/regex/pdpj-documentos";
import { converterValorMonetario, normalizarAtoProcessual, normalizarTipoAudiencia } from "@/lib/regex/patterns";
import { aplicarPrazoEncontrado, aplicarAudienciaEncontrada } from "@/lib/prazo/aplicar-prazo";
import { normalizarTribunalSigla } from "@/lib/tribunais/normalizar";

const MAX_DOCUMENTOS_PER_REQUEST = 200;
const MAX_TEXTO_CHARS = 200_000;

interface DocumentoRecebido {
  pdpjDocumentoId: string;
  url: string | null;
  nome: string | null;
  tipo: string | null;
  dataHoraJuntada: string | null;
  texto: string | null;
}

/** Espelha PdpjMetadata do CS (meujudi-cs/src/main/pdpj-tasks.ts) — vindo de tramitacaoAtual no detalhe do PDPJ. */
interface MetadadosPdpjRecebidos {
  classeCodigo: number | null;
  classeNome: string | null;
  assuntos: Array<{ codigo: number | null; nome: string }>;
  tribunalSigla: string | null;
  valorCausa: number | null;
  orgaoJulgador: string | null;
  dataAjuizamento: string | null;
  autor: string | null;
  reu: string | null;
}

function selecionarMetadados(value: unknown): MetadadosPdpjRecebidos | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const assuntos = Array.isArray(raw.assuntos)
    ? raw.assuntos
        .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
        .map((a) => ({ codigo: typeof a.codigo === "number" ? a.codigo : null, nome: typeof a.nome === "string" ? a.nome.slice(0, 300) : "" }))
        .filter((a) => a.nome)
        .slice(0, 20)
    : [];
  return {
    classeCodigo: typeof raw.classeCodigo === "number" ? raw.classeCodigo : null,
    classeNome: typeof raw.classeNome === "string" ? raw.classeNome.slice(0, 300) : null,
    assuntos,
    tribunalSigla: typeof raw.tribunalSigla === "string" ? raw.tribunalSigla.slice(0, 20) : null,
    valorCausa: typeof raw.valorCausa === "number" ? raw.valorCausa : null,
    orgaoJulgador: typeof raw.orgaoJulgador === "string" ? raw.orgaoJulgador.slice(0, 300) : null,
    dataAjuizamento: typeof raw.dataAjuizamento === "string" ? raw.dataAjuizamento : null,
    autor: typeof raw.autor === "string" ? raw.autor.slice(0, 300) : null,
    reu: typeof raw.reu === "string" ? raw.reu.slice(0, 300) : null,
  };
}

/**
 * Preenche classe/assuntos/tribunal/valor/órgão julgador/autor/réu no
 * processo — só quando o campo ainda está vazio (nunca sobrescreve um
 * valor já confirmado por outra fonte, mesma regra de
 * `processarTextoDocumento` logo abaixo). PDPJ vira uma fonte de metadados
 * estruturados a mais, não a autoridade única — DataJud/Mural continuam
 * podendo já ter preenchido isso antes.
 */
async function aplicarMetadadosPdpj(supabase: SupabaseClient, tenantId: string, processoId: string, metadata: MetadadosPdpjRecebidos): Promise<void> {
  const { data: processo } = await supabase
    .from("processos")
    .select("tribunal, classe_nome, assuntos, valor_causa, orgao_julgador, data_ajuizamento, autor, reu")
    .eq("id", processoId)
    .maybeSingle();
  if (!processo) return;

  const tribunalNormalizado = metadata.tribunalSigla ? normalizarTribunalSigla(metadata.tribunalSigla) : null;
  const update: Record<string, unknown> = {};
  if (metadata.classeNome && !processo.classe_nome) {
    update.classe_nome = metadata.classeNome;
    if (metadata.classeCodigo != null) update.classe_codigo = metadata.classeCodigo;
  }
  if (metadata.assuntos.length > 0 && (!Array.isArray(processo.assuntos) || processo.assuntos.length === 0)) update.assuntos = metadata.assuntos;
  if (tribunalNormalizado && !processo.tribunal) update.tribunal = tribunalNormalizado;
  if (metadata.valorCausa != null && processo.valor_causa == null) update.valor_causa = metadata.valorCausa;
  if (metadata.orgaoJulgador && !processo.orgao_julgador) update.orgao_julgador = metadata.orgaoJulgador;
  if (metadata.dataAjuizamento && !processo.data_ajuizamento) update.data_ajuizamento = metadata.dataAjuizamento;
  if (metadata.autor && !processo.autor) update.autor = metadata.autor;
  if (metadata.reu && !processo.reu) update.reu = metadata.reu;

  if (Object.keys(update).length === 0) return;
  const { error } = await supabase.from("processos").update(update).eq("id", processoId);
  if (error) console.error("[cs/sync/pdpj] falha ao aplicar metadados do PDPJ:", error.message);
}

/**
 * POST /api/cs/sync/pdpj
 *
 * Recebe o resultado de uma tarefa `pdpj_cnj` (detalhe de processo
 * consultado no Portal PDPJ): garante que o processo existe na tabela
 * `processos` do tenant (`ultima_sync_pje` atualizado) e persiste os
 * documentos descobertos em `processo_documentos` (link + metadados), com
 * deduplicação por `pdpj_documento_id` (UUID estável do documento no Codex
 * do PDPJ) — Fase 8 de docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md,
 * estendida em 29/07/2026 com o texto do documento (via `hrefTexto` do
 * PDPJ, confirmado por captura de tráfego real — nunca `hrefBinario`, o CS
 * nunca busca o PDF).
 *
 * Antes deduplicava por hash de `hrefBinario`, e `url` era obrigatório —
 * documento só com `hrefTexto` (sem link de binário) era descartado
 * inteiro: texto já baixado jogado fora, regex de prazo/audiência nunca
 * rodava nele, e ficava pra sempre "novo" pro pulo inteligente (achado
 * 31/07/2026, ver migração 20260731170000). `pdpj_documento_id` cobre os
 * dois casos, então documento só-texto agora é salvo e dedupado também.
 *
 * O texto recebido é transitório: grava a linha, roda o Regex
 * (`@/lib/regex/pdpj-documentos`) na mesma requisição, aplica prazo e
 * audiência (quando a data for reconhecida) na Agenda — mesmo pipeline que
 * o Mural já usa — e então apaga o texto bruto da linha, a menos que
 * `PDPJ_TEXTO_DEBUG_TENANT_ID` esteja setado pro tenant do device (janela
 * de calibração dos regexes contra um documento real, ver
 * docs/roadmap/22-extracao-pdpj-e-fila-cs.md — desligar depois de usar).
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo_invalido" }, { status: 400 });
  }

  const cnj = typeof body.cnj === "string" ? body.cnj.replace(/\D/g, "") : "";
  if (cnj.length !== 20) return NextResponse.json({ error: "cnj_invalido" }, { status: 400 });

  const documentos = selecionarDocumentosValidos(body.documentos);
  const now = new Date().toISOString();

  // Compartilhamento: buscar processo por CNJ em QUALQUER tenant
  const { data: existingGlobal } = await supabase
    .from("processos")
    .select("id, tenant_id")
    .eq("cnj", cnj)
    .maybeSingle();

  let processoId = existingGlobal?.id as string | undefined;
  let createdNew = false;

  if (processoId) {
    // Processo já existe em algum tenant — verificar se este tenant já é participante
    const { data: existingParticipation } = await supabase
      .from("processo_participantes")
      .select("id")
      .eq("processo_id", processoId)
      .eq("tenant_id", device.tenantId)
      .maybeSingle();

    if (!existingParticipation) {
      // Tenant não é participante — adicionar vínculo (sem baixar dados do zero)
      await supabase.from("processo_participantes").insert({
        processo_id: processoId,
        tenant_id: device.tenantId,
        oab_number: body.oabNumber ?? "",
        oab_uf: body.oabUf ?? "",
        source: "pdpj",
      }).select("id").maybeSingle();
    }

    // Atualizar timestamps de sync
    const { error } = await supabase
      .from("processos")
      .update({ ultima_sync_pje: now, ultima_sync_pdpj: now })
      .eq("id", processoId);
    if (error) {
      console.error("[cs/sync/pdpj] falha ao atualizar processo:", error);
      return NextResponse.json({ error: "processo_nao_atualizado" }, { status: 500 });
    }
  } else {
    // Processo novo — criar e vincular tenant
    const { data: inserted, error } = await supabase
      .from("processos")
      .insert({
        cnj,
        source_context: "private_cs",
        created_by_tenant: device.tenantId,
        ultima_sync_pje: now,
        ultima_sync_pdpj: now,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      // 23505 = unique_violation (cnj) — corrida com outra tarefa
      if (error.code === "23505") {
        const { data: refetched } = await supabase.from("processos").select("id").eq("cnj", cnj).maybeSingle();
        processoId = refetched?.id;
      } else {
        console.error("[cs/sync/pdpj] falha ao criar processo:", error);
        return NextResponse.json({ error: "processo_nao_criado" }, { status: 500 });
      }
    } else {
      processoId = inserted?.id;
      createdNew = true;
    }

    // Vincular tenant ao processo (auto_link_process_participant trigger já faz isso,
    // mas garantimos que a participação existe para OAB específica)
    if (processoId) {
      await supabase.from("processo_participantes").insert({
        processo_id: processoId,
        tenant_id: device.tenantId,
        oab_number: body.oabNumber ?? "",
        oab_uf: body.oabUf ?? "",
        source: "pdpj",
      }).select("id").maybeSingle();
    }
  }

  const metadata = selecionarMetadados(body.metadata);
  if (processoId && metadata) await aplicarMetadadosPdpj(supabase, device.tenantId, processoId, metadata);

  let documentosSalvos = 0;
  let textosProcessados = 0;
  if (processoId) {
    for (const doc of documentos) {
      const docId = await salvarDocumento(supabase, device.tenantId, processoId, doc);
      if (docId) documentosSalvos += 1;
      if (docId && doc.texto) {
        await processarTextoDocumento(supabase, device.tenantId, processoId, docId, doc);
        textosProcessados += 1;
      }
    }
  }

  return NextResponse.json({ ok: true, processoId, created: createdNew, documentosSalvos, textosProcessados, documentosRecebidos: documentos.length });
}

/** Grava (ou atualiza) a linha do documento; devolve o id pra quem chamar poder processar o texto em seguida. */
async function salvarDocumento(
  supabase: SupabaseClient,
  tenantId: string,
  processoId: string,
  doc: DocumentoRecebido,
): Promise<string | null> {
  if (!doc.pdpjDocumentoId) return null;
  const urlHash = doc.url ? createHash("sha256").update(doc.url, "utf-8").digest("hex") : null;
  const { data, error } = await supabase
    .from("processo_documentos")
    .upsert(
      {
        tenant_id: tenantId,
        processo_id: processoId,
        fonte: "pdpj" as const,
        pdpj_documento_id: doc.pdpjDocumentoId,
        url: doc.url,
        url_hash: urlHash,
        nome: doc.nome,
        tipo: doc.tipo,
        data_juntada: doc.dataHoraJuntada,
        texto: doc.texto,
      },
      { onConflict: "tenant_id,processo_id,pdpj_documento_id" },
    )
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[cs/sync/pdpj] falha ao salvar documento:", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Roda o Regex sobre o texto salvo, aplica o prazo encontrado na Agenda
 * (mesmo pipeline do Mural, `fonte: "pdpj"`) e preenche campos do processo
 * que ainda estejam vazios — nunca sobrescreve um valor já confirmado por
 * outra fonte. No final, apaga o texto bruto da linha (só a extração
 * estruturada fica).
 */
async function processarTextoDocumento(
  supabase: SupabaseClient,
  tenantId: string,
  processoId: string,
  documentoId: string,
  doc: DocumentoRecebido,
): Promise<void> {
  const texto = doc.texto!;
  const extraido = extrairDocumentoPdpj(texto, doc.tipo);

  const { data: processo } = await supabase
    .from("processos")
    .select("orgao_julgador, magistrado_nome, valor_causa, autor, reu")
    .eq("id", processoId)
    .maybeSingle();

  const valorCausa = converterValorMonetario(extraido.valorCausa?.replace(/^R\$\s*/i, "") ?? null);
  const autor = extraido.partes.find((p) => p.polo === "ativo")?.nome ?? null;
  const reu = extraido.partes.find((p) => p.polo === "passivo")?.nome ?? null;

  const updateProcesso: Record<string, unknown> = {};
  if (extraido.orgaoJulgador && !processo?.orgao_julgador) updateProcesso.orgao_julgador = extraido.orgaoJulgador;
  if (extraido.magistrado && !processo?.magistrado_nome) updateProcesso.magistrado_nome = extraido.magistrado;
  if (valorCausa != null && processo?.valor_causa == null) updateProcesso.valor_causa = valorCausa;
  if (autor && !processo?.autor) updateProcesso.autor = autor;
  if (reu && !processo?.reu) updateProcesso.reu = reu;
  if (Object.keys(updateProcesso).length > 0) {
    const { error } = await supabase.from("processos").update(updateProcesso).eq("id", processoId);
    if (error) console.error("[cs/sync/pdpj] falha ao atualizar processo com dados extraídos:", error);
  }

  const primeiroPrazo = extraido.prazos[0];
  if (primeiroPrazo && primeiroPrazo.unidade === "dias") {
    const dataReferencia = doc.dataHoraJuntada ? new Date(doc.dataHoraJuntada) : new Date();
    await aplicarPrazoEncontrado(supabase, {
      tenantId,
      processoId,
      prazoDias: primeiroPrazo.dias,
      dataReferencia,
      fonte: "pdpj",
      fonteId: documentoId,
      descricao: doc.tipo ?? doc.nome ?? "Documento PDPJ",
      naturezaPrazo: normalizarAtoProcessual(primeiroPrazo.contexto),
      extracaoOrigem: "regex",
      extracaoConfianca: "media",
      textoOrigem: primeiroPrazo.contexto,
    });
  }
  const primeiraAudiencia = extraido.audiencias.find((a) => a.dataIso);
  if (primeiraAudiencia?.dataIso) {
    await aplicarAudienciaEncontrada(supabase, {
      tenantId,
      processoId,
      dataAudienciaIso: primeiraAudiencia.dataIso,
      fonte: "pdpj",
      fonteId: documentoId,
      titulo: `Audiência — ${doc.tipo ?? doc.nome ?? "Documento PDPJ"}`,
      tipoAudiencia: normalizarTipoAudiencia(primeiraAudiencia.valor, primeiraAudiencia.contexto),
      extracaoOrigem: "regex",
      extracaoConfianca: "media",
      textoOrigem: primeiraAudiencia.contexto,
    });
  }

  // Janela de calibração: quando setado pro tenant certo, mantém o texto
  // bruto salvo pra revisão manual do primeiro documento real (ver
  // docs/roadmap/22-extracao-pdpj-e-fila-cs.md) — desligar depois de usar.
  const manterTextoParaCalibracao = process.env.PDPJ_TEXTO_DEBUG_TENANT_ID === tenantId;
  const { error } = await supabase
    .from("processo_documentos")
    .update({
      extracao: extraido,
      texto: manterTextoParaCalibracao ? texto : null,
      processado_em: new Date().toISOString(),
    })
    .eq("id", documentoId)
    .eq("tenant_id", tenantId);
  if (error) console.error("[cs/sync/pdpj] falha ao salvar extração / limpar texto:", error);
}

/**
 * Exige `pdpjDocumentoId` (chave de dedup — sem ele o documento não tem
 * como ser identificado de forma estável). URL só é aceita se https do
 * próprio domínio do Portal PDPJ e com cara de documento/peça — descarta
 * links genéricos, vazios ou de outros domínios, mas o documento continua
 * sendo salvo mesmo sem URL (caso só-texto). Trunca texto absurdamente
 * grande como proteção defensiva (o endpoint /texto nunca foi validado em
 * produção).
 */
function selecionarDocumentosValidos(value: unknown): DocumentoRecebido[] {
  if (!Array.isArray(value)) return [];
  const idsVistos = new Set<string>();
  const validos: DocumentoRecebido[] = [];
  for (const item of value) {
    if (validos.length >= MAX_DOCUMENTOS_PER_REQUEST || typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    const pdpjDocumentoId = typeof raw.pdpjDocumentoId === "string" ? raw.pdpjDocumentoId.trim().slice(0, 200) : "";
    if (!pdpjDocumentoId || idsVistos.has(pdpjDocumentoId)) continue;

    const urlRaw = typeof raw.url === "string" ? raw.url.trim() : "";
    let url: string | null = null;
    if (urlRaw) {
      try {
        const parsed = new URL(urlRaw);
        if (parsed.protocol === "https:" && parsed.hostname.endsWith("pdpj.jus.br") && /documento/i.test(parsed.pathname)) {
          url = urlRaw;
        }
      } catch {
        // url inválida — ignora, mas ainda pode aproveitar o texto abaixo.
      }
    }
    const textoRaw = typeof raw.texto === "string" ? raw.texto.trim() : "";
    const texto = textoRaw ? (textoRaw.length > MAX_TEXTO_CHARS ? textoRaw.slice(0, MAX_TEXTO_CHARS) : textoRaw) : null;

    idsVistos.add(pdpjDocumentoId);
    validos.push({
      pdpjDocumentoId,
      url,
      nome: typeof raw.nome === "string" ? raw.nome.slice(0, 300) : null,
      tipo: typeof raw.tipo === "string" ? raw.tipo.slice(0, 200) : null,
      dataHoraJuntada: typeof raw.dataHoraJuntada === "string" ? raw.dataHoraJuntada : null,
      texto,
    });
  }
  return validos;
}
