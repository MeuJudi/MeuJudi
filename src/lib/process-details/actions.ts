"use server";

import { requireAppUser, requireWritableAppUser } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/service";
import { displayUserName } from "@/lib/auth/display-name";

export type ProcessDetails = {
  process: {
    id: string;
    cnj: string;
    tribunal: string | null;
    grau: string | null;
    sistema: string | null;
    data_ajuizamento: string | null;
    formato_codigo: number | null;
    formato_nome: string | null;
    orgao_julgador_codigo: number | null;
    orgao_julgador_municipio_ibge: number | null;
    classe_codigo: number | null;
    classe_nome: string | null;
    assuntos: unknown;
    nivel_sigilo: number;
    orgao_julgador: string | null;
    magistrado_nome: string | null;
    magistrado_tipo: string | null;
    autor: string | null;
    reu: string | null;
    advogados: unknown;
    valor_causa: number | null;
    prazo_proxima_resposta: string | null;
    proxima_audiencia: string | null;
    status: string;
    tags: string[] | null;
    is_favorito: boolean;
    ultima_sync_datajud: string | null;
    ultima_sync_mural: string | null;
    ultima_sync_pje: string | null;
    data_ultima_movimentacao: string | null;
    source_context: string;
    created_at: string;
    updated_at: string;
  };
  movements: {
    id: string;
    data_movimento: string;
    nome: string;
    texto_completo: string | null;
    fonte: string;
    prazo_fatal: string | null;
    is_novo: boolean;
  }[];
  agenda: {
    id: string;
    tipo: string;
    titulo: string;
    descricao: string | null;
    data_inicio: string;
    data_fim: string | null;
    status: string;
    fonte: string;
    link_videoconferencia: string | null;
  }[];
  mural: {
    id: string;
    data_disponibilizacao: string;
    sigla_tribunal: string;
    tipo_comunicacao: string;
    nome_orgao: string | null;
    texto: string;
  }[];
  documentos: {
    id: string;
    nome: string | null;
    tipo: string | null;
    data_juntada: string | null;
    url: string;
    descoberto_em: string;
    extracao: Record<string, unknown> | null;
  }[];
};

export async function getProcessDetails(processId: string): Promise<ProcessDetails> {
  const { supabase } = await requireAppUser();

  const { data: process, error } = await supabase
    .from("processos")
    .select(`
      id,
      cnj,
      tribunal,
      grau,
      sistema,
      data_ajuizamento,
      formato_codigo,
      formato_nome,
      orgao_julgador_codigo,
      orgao_julgador_municipio_ibge,
      classe_codigo,
      classe_nome,
      assuntos,
      nivel_sigilo,
      orgao_julgador,
      magistrado_nome,
      magistrado_tipo,
      autor,
      reu,
      advogados,
      valor_causa,
      prazo_proxima_resposta,
      proxima_audiencia,
      status,
      tags,
      is_favorito,
      ultima_sync_datajud,
      ultima_sync_mural,
      ultima_sync_pje,
      data_ultima_movimentacao,
      source_context,
      created_at,
      updated_at
    `)
    .eq("id", processId)
    .single();

  if (error || !process) {
    throw new Error(error?.message ?? "Processo nao encontrado.");
  }

  const attorneys = Array.isArray(process.advogados) ? process.advogados : [];
  const attorneyKeys = attorneys.flatMap((value) => {
    if (typeof value !== "object" || !value) return [];
    const record = value as Record<string, unknown>;
    const number = String(record.oab ?? record.numero_oab ?? "").replace(/\D/g, "");
    const uf = String(record.uf ?? record.uf_oab ?? "").trim().toUpperCase();
    return number && uf ? [{ number, uf }] : [];
  });
  const uniqueAttorneyKeys = [...new Map(attorneyKeys.map((key) => [`${key.number}/${key.uf}`, key])).values()];
  // Todas as partes do modal são independentes depois que o processo foi
  // autorizado. Executá-las juntas evita que avatar -> movimentações ->
  // agenda -> Mural virem uma fila de esperas.
  const [{ data: movements }, { data: agenda }, { data: mural }, { data: documentos }, enrichedAttorneys] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, data_movimento, nome, texto_completo, fonte, prazo_fatal, is_novo")
      .eq("processo_id", processId)
      .order("data_movimento", { ascending: false })
      .limit(12),
    supabase
      .from("agenda_eventos")
      .select("id, tipo, titulo, descricao, data_inicio, data_fim, status, fonte, link_videoconferencia")
      .eq("processo_id", processId)
      .order("data_inicio", { ascending: true })
      .limit(12),
    supabase
      .from("comunicacoes_mural")
      .select("id, data_disponibilizacao, sigla_tribunal, tipo_comunicacao, nome_orgao, texto")
      .eq("processo_id", processId)
      .order("data_disponibilizacao", { ascending: false })
      .limit(6),
    supabase
      .from("processo_documentos")
      .select("id, nome, tipo, data_juntada, url, descoberto_em, extracao")
      .eq("processo_id", processId)
      .order("data_juntada", { ascending: false, nullsFirst: false })
      .limit(20),
    resolveAttorneyAvatars(uniqueAttorneyKeys, attorneys),
  ]);

  return {
    process: { ...(process as ProcessDetails["process"]), advogados: enrichedAttorneys },
    movements: (movements ?? []) as ProcessDetails["movements"],
    agenda: (agenda ?? []) as ProcessDetails["agenda"],
    mural: (mural ?? []) as ProcessDetails["mural"],
    documentos: (documentos ?? []) as ProcessDetails["documentos"],
  };
}

type AttorneyKey = { number: string; uf: string };

async function resolveAttorneyAvatars(keys: AttorneyKey[], attorneys: unknown[]) {
  if (keys.length === 0) return attorneys;

  // O processo já foi carregado usando o cliente com sessão/RLS. Só depois
  // dessa autorização consultamos dados visuais mínimos por OAB exata.
  const service = createServiceClient();
  const numbers = [...new Set(keys.map((key) => key.number))];
  const ufs = [...new Set(keys.map((key) => key.uf))];
  const [{ data: users }, { data: directory }] = await Promise.all([
    service.from("users")
      .select("name, nickname, oab_number, oab_uf, avatar_url, gender, is_active")
      .in("oab_number", numbers)
      .in("oab_uf", ufs)
      .eq("is_active", true),
    service.from("lawyers_directory")
      .select("oab_number_normalized, oab_uf, canonical_name, avatar_url, avatar_source")
      .in("oab_number_normalized", numbers)
      .in("oab_uf", ufs),
  ]);

  const matches = new Map<string, { avatar_url: string; avatar_source: string; display_name: string }>();
  for (const user of users ?? []) {
    const number = String(user.oab_number ?? "").replace(/\D/g, "");
    const uf = String(user.oab_uf ?? "").toUpperCase();
    if (number && uf && user.avatar_url) {
      const displayName = String(user.nickname ?? user.name ?? "").trim();
      matches.set(`${number}/${uf}`, {
        avatar_url: user.avatar_url,
        avatar_source: "meujudi_user",
        display_name: displayName ? displayUserName({ name: user.name, nickname: user.nickname, oab_number: number, oab_uf: uf, gender: user.gender }) : "",
      });
    }
  }
  for (const item of directory ?? []) {
    const key = `${item.oab_number_normalized}/${String(item.oab_uf).toUpperCase()}`;
    if (!matches.has(key) && item.avatar_url) {
      matches.set(key, { avatar_url: item.avatar_url, avatar_source: item.avatar_source ?? "authorized_external", display_name: item.canonical_name ?? "" });
    }
  }

  return attorneys.map((value) => {
    if (typeof value !== "object" || !value) return value;
    const record = value as Record<string, unknown>;
    const number = String(record.oab ?? record.numero_oab ?? "").replace(/\D/g, "");
    const uf = String(record.uf ?? record.uf_oab ?? "").trim().toUpperCase();
    const match = matches.get(`${number}/${uf}`);
    return match ? { ...record, nome: match.display_name || record.nome, avatar_url: match.avatar_url, avatar_source: match.avatar_source } : value;
  });
}

/**
 * Pede pro CS (via Realtime — ver src/lib/cs/realtime-token.ts) buscar o
 * PDF de um documento específico, sob demanda. Só cria a "campainha" —
 * quem busca de verdade e sobe pro Storage é o CS, através das rotas
 * /api/cs/document-requests/* autenticadas por device token.
 */
export async function solicitarDocumento(processoDocumentoId: string): Promise<{ requestId: string }> {
  const { supabase, profile } = await requireWritableAppUser();
  if (!profile.tenant_id) throw new Error("Usuario sem tenant.");

  const { data: documento, error: documentoError } = await supabase
    .from("processo_documentos")
    .select("id, processo_id, pdpj_documento_id, processos!inner(cnj)")
    .eq("id", processoDocumentoId)
    .single<{ id: string; processo_id: string; pdpj_documento_id: string | null; processos: { cnj: string } }>();
  if (documentoError || !documento) throw new Error("Documento nao encontrado.");
  if (!documento.pdpj_documento_id) throw new Error("Documento sem identificador PDPJ — nao e possivel buscar o PDF.");

  const cnjValue = documento.processos?.cnj;
  if (!cnjValue) throw new Error("Processo sem CNJ associado.");

  const { data: created, error: insertError } = await supabase
    .from("document_fetch_requests")
    .insert({
      tenant_id: profile.tenant_id,
      processo_documento_id: documento.id,
      cnj: cnjValue,
      pdpj_documento_id: documento.pdpj_documento_id,
      requested_by: profile.id,
    })
    .select("id")
    .single();
  if (insertError || !created) throw new Error(insertError?.message ?? "Nao foi possivel criar o pedido.");

  return { requestId: created.id };
}

/** Mesmo padrao de getMuralSyncRequest (monitoramento/actions.ts) — polling curto do status. */
export async function getDocumentFetchRequest(requestId: string) {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };
  const { data, error } = await supabase
    .from("document_fetch_requests")
    .select("id, status, error_message")
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle();
  if (error) return { ok: false as const, message: error.message };
  if (!data) return { ok: false as const, message: "Pedido de documento não encontrado." };
  const status: "processing" | "completed" | "failed" =
    data.status === "done" ? "completed" : data.status === "failed" || data.status === "expired" ? "failed" : "processing";
  return { ok: true as const, status, errorMessage: data.error_message };
}

/**
 * Gera a signed URL de vida curta pro PDF já buscado pelo CS. O bucket
 * `documentos-temp` não tem policy nenhuma pra `authenticated`/`anon` (só
 * service role) — por isso confirma a posse via RLS no client de sessão
 * antes de usar o client de service role só pra assinar a URL.
 */
export async function getDocumentSignedUrl(requestId: string, modo: "visualizar" | "baixar" = "visualizar") {
  const { supabase, profile } = await requireAppUser();
  if (!profile.tenant_id) return { ok: false as const, message: "Usuário sem escritório vinculado." };
  const { data, error } = await supabase
    .from("document_fetch_requests")
    .select("id, status, storage_path, processo_documentos(nome)")
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .maybeSingle<{ id: string; status: string; storage_path: string | null; processo_documentos: { nome: string | null } | null }>();
  if (error) return { ok: false as const, message: error.message };
  if (!data || data.status !== "done" || !data.storage_path) {
    return { ok: false as const, message: "Documento ainda não está pronto." };
  }

  const service = createServiceClient();
  // "baixar" pede Content-Disposition: attachment pro Storage — sem isso o
  // navegador ignora o atributo download de <a> em URL de outra origem e
  // só abre o visualizador nativo de PDF (achado ao testar: apertar
  // "Baixar" abria a mesma tela do "Visualizar" em vez de salvar o arquivo).
  const nomeArquivo = data.processo_documentos?.nome || "documento.pdf";
  const { data: signed, error: signError } = await service.storage
    .from("documentos-temp")
    .createSignedUrl(data.storage_path, 300, modo === "baixar" ? { download: nomeArquivo } : undefined);
  if (signError || !signed) return { ok: false as const, message: signError?.message ?? "Não foi possível gerar o link do documento." };

  return { ok: true as const, url: signed.signedUrl };
}
