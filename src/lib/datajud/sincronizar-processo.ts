import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarProcessoEmTribunais, normalizarDataJudData } from "./client";
import { extrairTribunaisCandidatos } from "./tribunal-from-cnj";
import { extrairPrazoDias, extrairPrazoHoras } from "@/lib/regex/patterns";
import { aplicarPrazoEncontrado } from "@/lib/prazo/aplicar-prazo";

type ProcessoParaSincronizar = {
  id: string;
  cnj: string;
  data_ultima_movimentacao: string | null;
  data_ultima_movimentacao_datajud?: string | null;
};

export async function sincronizarProcessoDataJud(
  supabase: SupabaseClient,
  tenantId: string,
  processo: ProcessoParaSincronizar,
  apiKey: string,
) {
  const achado = await buscarProcessoEmTribunais(processo.cnj, extrairTribunaisCandidatos(processo.cnj), apiKey);
  if (!achado) return { status: "nao_encontrado" as const, movimentacoes: 0 };

  const { processo: fresh, tribunalUsado } = achado;
  const dataLocal = processo.data_ultima_movimentacao_datajud
    ? new Date(processo.data_ultima_movimentacao_datajud)
    : new Date(0);
  const dataFreshIso = normalizarDataJudData(fresh.dataHoraUltimaAtualizacao);
  if (!dataFreshIso) throw new Error(`Data de atualização inválida retornada pelo DataJud: ${fresh.dataHoraUltimaAtualizacao}`);
  const dataFresh = new Date(dataFreshIso);
  const metadata = {
    classe_codigo: fresh.classe?.codigo ?? null,
    classe_nome: fresh.classe?.nome ?? null,
    assuntos: fresh.assuntos ?? [],
    orgao_julgador: fresh.orgaoJulgador?.nome ?? null,
    orgao_julgador_codigo: fresh.orgaoJulgador?.codigo ?? null,
    orgao_julgador_municipio_ibge: fresh.orgaoJulgador?.codigoMunicipioIBGE ?? null,
    tribunal: fresh.tribunal ?? tribunalUsado,
    grau: fresh.grau ?? null,
    sistema: fresh.sistema?.nome ?? null,
    nivel_sigilo: fresh.nivelSigilo ?? 0,
    data_ajuizamento: normalizarDataJudData(fresh.dataAjuizamento),
    formato_codigo: fresh.formato?.codigo ?? null,
    formato_nome: fresh.formato?.nome ?? null,
    ultima_sync_datajud: new Date().toISOString(),
  };

  const globalDate = processo.data_ultima_movimentacao ? new Date(processo.data_ultima_movimentacao) : null;
  const update = {
    ...metadata,
    data_ultima_movimentacao_datajud: dataFreshIso,
    ...(dataFresh > dataLocal && (!globalDate || dataFresh > globalDate) ? { data_ultima_movimentacao: dataFreshIso } : {}),
  };
  const { error: processError } = await supabase.from("processos").update(update).eq("id", processo.id).eq("tenant_id", tenantId);
  if (processError) throw processError;
  if (dataFresh <= dataLocal) return { status: "sem_mudanca" as const, movimentacoes: 0 };

  let movimentacoes = 0;
  for (const mov of fresh.movimentos ?? []) {
    const dataMovimentoIso = normalizarDataJudData(mov.dataHora);
    if (!dataMovimentoIso || new Date(dataMovimentoIso) <= dataLocal) continue;
    const complementos = mov.complementosTabelados ?? [];
    const texto = `${mov.nome} ${complementos.map((item) => item.nome ?? item.descricao ?? String(item.valor ?? "")).join(" ")}`.trim();
    const prazoDias = extrairPrazoDias(texto);
    const prazoHoras = extrairPrazoHoras(texto);
    const { data: inserted, error } = await supabase.from("movimentacoes").insert({
      tenant_id: tenantId,
      processo_id: processo.id,
      data_movimento: dataMovimentoIso,
      codigo: mov.codigo,
      nome: mov.nome,
      texto_completo: texto,
      complementos,
      orgao_julgador: mov.orgaoJulgador?.nomeOrgao ?? mov.orgaoJulgador?.nome ?? null,
      orgao_julgador_codigo: mov.orgaoJulgador?.codigoOrgao ?? mov.orgaoJulgador?.codigo ?? null,
      fonte: "datajud",
      is_novo: true,
      prazo_dias: prazoDias,
      prazo_horas: prazoHoras,
    }).select("id").single();
    if (error && error.code !== "23505") throw error;
    if (!error) movimentacoes++;

    if (prazoDias && inserted?.id) {
      await aplicarPrazoEncontrado(supabase, {
        tenantId,
        processoId: processo.id,
        prazoDias,
        dataReferencia: new Date(dataMovimentoIso),
        fonte: "datajud",
        fonteId: inserted?.id ?? null,
        descricao: mov.nome,
        extracaoOrigem: "regex",
        extracaoConfianca: "alta",
        textoOrigem: texto,
      });
    }
  }

  return { status: "atualizado" as const, movimentacoes };
}
