"use server";

import { requireAppUser } from "@/lib/auth/guards";

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
    process: process as ProcessDetails["process"],
    movements: (movements ?? []) as ProcessDetails["movements"],
    agenda: (agenda ?? []) as ProcessDetails["agenda"],
    mural: (mural ?? []) as ProcessDetails["mural"],
  };
}
