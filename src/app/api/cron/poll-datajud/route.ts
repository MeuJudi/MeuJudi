// Cron: atualiza processos ativos consultando o DataJud (Sprint 2). Uma
// chamada = um processo já conhecido (não descobre processo novo — isso é
// papel do Mural, poll-mural/route.ts). Frequência configurada por tenant em
// `tenants.sync_config` (ajustada manualmente até existir sistema de planos).
// Segue o mesmo padrão de auth/estrutura de
// src/app/api/cron/processar-fila-lote/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { extrairTribunaisCandidatos } from "@/lib/datajud/tribunal-from-cnj";
import { buscarProcessoEmTribunais, normalizarDataJudData } from "@/lib/datajud/client";
import { extrairPrazoDias, extrairPrazoHoras } from "@/lib/regex/patterns";
import { aplicarPrazoEncontrado } from "@/lib/prazo/aplicar-prazo";
import { extrairCampo } from "@/lib/extracao/pipeline";
import { detectarSinalFracoDeUrgencia } from "@/lib/extracao/detectar-sinal-urgencia";

// Sem isso, a Vercel usa o timeout padrão (bem curto no plano Hobby) e mata a
// função no meio do processamento — o cron-job.org marca como "falha
// (timeout)" e nem chega a aparecer erro nenhum nos logs da Vercel, porque
// não é um erro, é a função sendo cortada antes de terminar. 60s é o teto do
// plano Hobby; se o MeuJudi migrar pra Pro, dá pra subir esse valor.
export const maxDuration = 60;

interface SyncConfig {
  horario_inicio: number;
  horario_fim: number;
  intervalo_horas: number;
  ativo: boolean;
}

function horaAtualBrasilia(): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  });
  return parseInt(formatter.format(new Date()), 10);
}

function deveRodarAgora(config: SyncConfig, horaAtual: number): boolean {
  if (!config?.ativo) return false;
  if (horaAtual < config.horario_inicio || horaAtual > config.horario_fim) return false;
  return (horaAtual - config.horario_inicio) % config.intervalo_horas === 0;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.DATAJUD_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "DATAJUD_API_KEY não configurada" }, { status: 500 });
  }

  const supabase = createServiceClient();
  const horaAtual = horaAtualBrasilia();
  const inicioExecucao = Date.now();

  // Cada execução processa só um lote pequeno por tenant, começando pelos
  // processos há mais tempo sem sincronizar (fila giratória) — em vez de
  // tentar dar conta de todos de uma vez e estourar o tempo da função
  // (era o motivo do "falha timeout" no cron-job.org: a Vercel matava a
  // função no meio do processamento). Com isso, o cron precisa rodar mais
  // vezes por hora pra cobrir todo mundo — ajustar a frequência no
  // cron-job.org de acordo com o volume real de processos.
  const LIMITE_PROCESSOS_POR_TENANT = 15;
  // Margem de segurança abaixo do maxDuration=60s — corta ANTES da Vercel
  // matar a função no meio de um tenant, pra sempre terminar com log limpo.
  const ORCAMENTO_TEMPO_MS = 45_000;

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, sync_config")
    .eq("is_active", true)
    .eq("access_status", "liberado");

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  const tenantsDaVez = (tenants ?? []).filter((t) => deveRodarAgora(t.sync_config as SyncConfig, horaAtual));

  const resultado = { tenants_processados: 0, processos_atualizados: 0, sem_mudanca: 0, erros: 0, parou_por_orcamento_de_tempo: false, duracao_ms: 0 };

  for (const tenant of tenantsDaVez) {
    if (Date.now() - inicioExecucao > ORCAMENTO_TEMPO_MS) {
      resultado.parou_por_orcamento_de_tempo = true;
      break;
    }

    const { data: processos, error: processosError } = await supabase
      .from("processos")
      .select("id, cnj, data_ultima_movimentacao, data_ultima_movimentacao_datajud")
      .eq("tenant_id", tenant.id)
      .eq("status", "ativo")
      .eq("nivel_sigilo", 0)
      .order("ultima_sync_datajud", { ascending: true, nullsFirst: true })
      .limit(LIMITE_PROCESSOS_POR_TENANT);

    if (processosError || !processos) {
      resultado.erros++;
      continue;
    }

    const CHUNK_SIZE = 5;
    for (let i = 0; i < processos.length; i += CHUNK_SIZE) {
      const chunk = processos.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (processo) => {
          try {
            const candidatos = extrairTribunaisCandidatos(processo.cnj);
            const achado = await buscarProcessoEmTribunais(processo.cnj, candidatos, apiKey);

            if (!achado) {
              resultado.erros++;
              return;
            }

            const { processo: fresh, tribunalUsado } = achado;
            const dataFreshIso = normalizarDataJudData(fresh.dataHoraUltimaAtualizacao);
            if (!dataFreshIso) throw new Error(`Data de atualização inválida retornada pelo DataJud: ${fresh.dataHoraUltimaAtualizacao}`);
            const dataFresh = new Date(dataFreshIso);
            const dataLocal = processo.data_ultima_movimentacao_datajud
              ? new Date(processo.data_ultima_movimentacao_datajud)
              : new Date(0);
            const globalDate = processo.data_ultima_movimentacao ? new Date(processo.data_ultima_movimentacao) : null;

            const metadataUpdate = {
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

            if (dataFresh <= dataLocal) {
              resultado.sem_mudanca++;
              const { error: metadataError } = await supabase
                .from("processos")
                .update({ ...metadataUpdate, data_ultima_movimentacao_datajud: dataFreshIso })
                .eq("id", processo.id);
              if (metadataError) throw metadataError;
              return;
            }

            const { error: processError } = await supabase
              .from("processos")
              .update({
                ...metadataUpdate,
                data_ultima_movimentacao_datajud: dataFreshIso,
                ...(!globalDate || dataFresh > globalDate ? { data_ultima_movimentacao: dataFreshIso } : {}),
              })
              .eq("id", processo.id);
            if (processError) throw processError;

            const novasMovs = (fresh.movimentos ?? []).flatMap((m) => {
              const dataMovimentoIso = normalizarDataJudData(m.dataHora);
              return dataMovimentoIso && new Date(dataMovimentoIso) > dataLocal ? [{ movimento: m, dataMovimentoIso }] : [];
            });

            for (const { movimento: mov, dataMovimentoIso } of novasMovs) {
              const complementos = mov.complementosTabelados ?? [];
              const textoCompleto = `${mov.nome} ${complementos.map((c) => c.nome ?? c.descricao ?? String(c.valor ?? "")).join(" ")}`.trim();
              const prazoDias = extrairPrazoDias(textoCompleto);
              const prazoHoras = extrairPrazoHoras(textoCompleto);

              const { data: movInserida, error: movementError } = await supabase
                .from("movimentacoes")
                .insert({
                  tenant_id: tenant.id,
                  processo_id: processo.id,
                  data_movimento: dataMovimentoIso,
                  codigo: mov.codigo,
                  nome: mov.nome,
                  texto_completo: textoCompleto,
                  complementos,
                  orgao_julgador: mov.orgaoJulgador?.nome ?? null,
                  orgao_julgador_codigo: mov.orgaoJulgador?.codigoOrgao ?? mov.orgaoJulgador?.codigo ?? null,
                  fonte: "datajud",
                  is_novo: true,
                  prazo_dias: prazoDias,
                  prazo_horas: prazoHoras,
                })
                .select("id")
                .single();
              if (movementError && movementError.code !== "23505") throw movementError;

              if (prazoDias) {
                await aplicarPrazoEncontrado(supabase, {
                  tenantId: tenant.id,
                  processoId: processo.id,
                  prazoDias,
                  dataReferencia: new Date(dataMovimentoIso),
                  fonte: "datajud",
                  fonteId: movInserida?.id ?? null,
                  descricao: mov.nome,
                  extracaoOrigem: "regex",
                  extracaoConfianca: "alta",
                  textoOrigem: textoCompleto,
                });
              } else if (movInserida) {
                // Regex simples não achou prazo — motor completo decide (Camada 0-6).
                // Sinal fraco de urgência (menção a prazo/audiência/intimação no
                // texto, ou tipo de movimentação sensível) evita que texto com
                // chance real de ser urgente caia na fila de lote (achado 02 da
                // auditoria — antes disso, esse ponto sempre mandava pro lote).
                await extrairCampo(supabase, {
                  tenantId: tenant.id,
                  processoId: processo.id,
                  texto: textoCompleto,
                  campo: "prazo",
                  tribunal: tribunalUsado,
                  contextoProcesso: { classe: fresh.classe?.nome ?? "", tribunal: tribunalUsado, tipo: mov.nome },
                  contextoUrgencia: {
                    prazoDiasDetectado: null,
                    dataAudienciaDetectada: null,
                    sinalFracoDeUrgencia: detectarSinalFracoDeUrgencia(textoCompleto, mov.nome),
                  },
                });
              }
            }

            resultado.processos_atualizados++;
          } catch (err) {
            resultado.erros++;
            console.error(`[poll-datajud] Erro no processo ${processo.cnj}:`, err instanceof Error ? err.message : err);
          }
        }),
      );

      if (i + CHUNK_SIZE < processos.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    resultado.tenants_processados++;
  }

  resultado.duracao_ms = Date.now() - inicioExecucao;

  // Log em try/catch: se a tabela não existir ou o insert falhar, a
  // resposta ainda deve ser enviada. Antes dessa correção, um erro aqui
  // impedia o NextResponse.json() de ser executado e causava timeout
  // no cron-job.org (ver diagnóstico de 24/07/2026).
  try {
    await supabase.from("motor_extracao_log").insert({
      tipo: "poll_datajud_finalizado",
      detalhes: resultado,
    });
  } catch (logErr) {
    console.error("[poll-datajud] Falha ao registrar log:", logErr instanceof Error ? logErr.message : logErr);
  }

  return NextResponse.json(resultado);
}
