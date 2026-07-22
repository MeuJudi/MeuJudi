"use server";

import { requireAppUser } from "@/lib/auth/guards";
import { createServiceClient } from "@/lib/supabase/service";

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
  }[];
  mural: {
    id: string;
    data_disponibilizacao: string;
    sigla_tribunal: string;
    tipo_comunicacao: string;
    nome_orgao: string | null;
    texto: string;
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
  const enrichedAttorneys = await resolveAttorneyAvatars(uniqueAttorneyKeys, attorneys);

  const [{ data: movements }, { data: agenda }, { data: mural }] = await Promise.all([
    supabase
      .from("movimentacoes")
      .select("id, data_movimento, nome, texto_completo, fonte, prazo_fatal, is_novo")
      .eq("processo_id", processId)
      .order("data_movimento", { ascending: false })
      .limit(12),
    supabase
      .from("agenda_eventos")
      .select("id, tipo, titulo, descricao, data_inicio, data_fim, status, fonte")
      .eq("processo_id", processId)
      .order("data_inicio", { ascending: true })
      .limit(12),
    supabase
      .from("comunicacoes_mural")
      .select("id, data_disponibilizacao, sigla_tribunal, tipo_comunicacao, nome_orgao, texto")
      .eq("processo_id", processId)
      .order("data_disponibilizacao", { ascending: false })
      .limit(6),
  ]);

  return {
    process: { ...(process as ProcessDetails["process"]), advogados: enrichedAttorneys },
    movements: (movements ?? []) as ProcessDetails["movements"],
    agenda: (agenda ?? []) as ProcessDetails["agenda"],
    mural: (mural ?? []) as ProcessDetails["mural"],
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
      .select("name, oab_number, oab_uf, avatar_url, is_active")
      .in("oab_number", numbers)
      .in("oab_uf", ufs)
      .eq("is_active", true),
    service.from("lawyers_directory")
      .select("oab_number_normalized, oab_uf, canonical_name, avatar_url, avatar_source")
      .in("oab_number_normalized", numbers)
      .in("oab_uf", ufs),
  ]);

  const matches = new Map<string, { avatar_url: string; avatar_source: string }>();
  for (const user of users ?? []) {
    const number = String(user.oab_number ?? "").replace(/\D/g, "");
    const uf = String(user.oab_uf ?? "").toUpperCase();
    if (number && uf && user.avatar_url) {
      matches.set(`${number}/${uf}`, { avatar_url: user.avatar_url, avatar_source: "meujudi_user" });
    }
  }
  for (const item of directory ?? []) {
    const key = `${item.oab_number_normalized}/${String(item.oab_uf).toUpperCase()}`;
    if (!matches.has(key) && item.avatar_url) {
      matches.set(key, { avatar_url: item.avatar_url, avatar_source: item.avatar_source ?? "authorized_external" });
    }
  }

  const recordsToCache = (users ?? [])
    .map((user) => {
      const number = String(user.oab_number ?? "").replace(/\D/g, "");
      const uf = String(user.oab_uf ?? "").toUpperCase();
      if (!number || !uf || !user.avatar_url) return null;
      return {
        oab_number_normalized: number,
        oab_uf: uf,
        canonical_name: user.name,
        avatar_url: user.avatar_url,
        avatar_source: "meujudi_user" as const,
        avatar_verified_at: new Date().toISOString(),
      };
    })
    .filter((record): record is {
      oab_number_normalized: string;
      oab_uf: string;
      canonical_name: string;
      avatar_url: string;
      avatar_source: "meujudi_user";
      avatar_verified_at: string;
    } => Boolean(record));
  if (recordsToCache.length > 0) {
    await service.from("lawyers_directory").upsert(recordsToCache, { onConflict: "oab_number_normalized,oab_uf" });
  }

  return attorneys.map((value) => {
    if (typeof value !== "object" || !value) return value;
    const record = value as Record<string, unknown>;
    const number = String(record.oab ?? record.numero_oab ?? "").replace(/\D/g, "");
    const uf = String(record.uf ?? record.uf_oab ?? "").trim().toUpperCase();
    const match = matches.get(`${number}/${uf}`);
    return match ? { ...record, avatar_url: match.avatar_url, avatar_source: match.avatar_source } : value;
  });
}
