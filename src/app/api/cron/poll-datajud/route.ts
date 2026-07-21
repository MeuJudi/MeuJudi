// Cron: atualiza processos ativos consultando o DataJud (Sprint 2). Uma
// chamada = um processo já conhecido (não descobre processo novo — isso é
// papel do Mural, poll-mural/route.ts). Frequência configurada por tenant em
// `tenants.sync_config` (ajustada manualmente até existir sistema de planos).
// Segue o mesmo padrão de auth/estrutura de
// src/app/api/cron/processar-fila-lote/route.ts.

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { extrairTribunaisCandidatos } from "@/lib/datajud/tribunal-from-cnj";
import { buscarProcessoEmTribunais } from "@/lib/datajud/client";
import { extrairPrazoDias, extrairPrazoHoras } from "@/lib/regex/patterns";
import { calcularPrazoFatal } from "@/lib/prazo/calcular-prazo-fatal";
import { extrairCampo } from "@/lib/extracao/pipeline";

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

  const { data: tenants, error: tenantsError } = await supabase
    .from("tenants")
    .select("id, sync_config")
    .eq("is_active", true);

  if (tenantsError) {
    return NextResponse.json({ error: tenantsError.message }, { status: 500 });
  }

  const tenantsDaVez = (tenants ?? []).filter((t) => deveRodarAgora(t.sync_config as SyncConfig, horaAtual));

  const resultado = { tenants_processados: 0, processos_atualizados: 0, sem_mudanca: 0, erros: 0 };

  for (const tenant of tenantsDaVez) {
    const { data: processos, error: processosError } = await supabase
      .from("processos")
      .select("id, cnj, data_ultima_movimentacao")
      .eq("tenant_id", tenant.id)
      .eq("status", "ativo")
      .eq("nivel_sigilo", 0);

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
            const dataFresh = new Date(fresh.dataHoraUltimaAtualizacao);
            const dataLocal = processo.data_ultima_movimentacao
              ? new Date(processo.data_ultima_movimentacao)
              : new Date(0);

            if (dataFresh <= dataLocal) {
              resultado.sem_mudanca++;
              await supabase
                .from("processos")
                .update({ ultima_sync_datajud: new Date().toISOString(), tribunal: tribunalUsado })
                .eq("id", processo.id);
              return;
            }

            await supabase
              .from("processos")
              .update({
                classe_codigo: fresh.classe?.codigo ?? null,
                classe_nome: fresh.classe?.nome ?? null,
                assuntos: fresh.assuntos ?? [],
                orgao_julgador: fresh.orgaoJulgador?.nome ?? null,
                tribunal: tribunalUsado,
                grau: fresh.grau ?? null,
                data_ultima_movimentacao: fresh.dataHoraUltimaAtualizacao,
                ultima_sync_datajud: new Date().toISOString(),
              })
              .eq("id", processo.id);

            const novasMovs = (fresh.movimentos ?? []).filter((m) => new Date(m.dataHora) > dataLocal);

            for (const mov of novasMovs) {
              const textoCompleto = `${mov.nome} ${(mov.complementosTabelados ?? []).map((c) => c.nome).join(" ")}`.trim();
              const prazoDias = extrairPrazoDias(textoCompleto);
              const prazoHoras = extrairPrazoHoras(textoCompleto);

              const { data: movInserida } = await supabase
                .from("movimentacoes")
                .insert({
                  tenant_id: tenant.id,
                  processo_id: processo.id,
                  data_movimento: mov.dataHora,
                  codigo: mov.codigo,
                  nome: mov.nome,
                  texto_completo: textoCompleto,
                  orgao_julgador: mov.orgaoJulgador?.nome ?? null,
                  fonte: "datajud",
                  is_novo: true,
                  prazo_dias: prazoDias,
                  prazo_horas: prazoHoras,
                })
                .select("id")
                .single();

              if (prazoDias) {
                const dataFatal = calcularPrazoFatal(new Date(mov.dataHora), prazoDias);
                await supabase.from("processos").update({ prazo_proxima_resposta: dataFatal }).eq("id", processo.id);
                await supabase.from("agenda_eventos").insert({
                  tenant_id: tenant.id,
                  processo_id: processo.id,
                  tipo: "prazo",
                  titulo: `Prazo: ${prazoDias} dias`,
                  descricao: mov.nome,
                  data_inicio: dataFatal,
                  fonte: "datajud",
                  fonte_id: movInserida?.id ?? null,
                });
              } else if (movInserida) {
                // Regex simples não achou prazo — motor completo decide (Camada 0-6);
                // sem sinal de urgência conhecido aqui, cai pra fila de lote por padrão.
                await extrairCampo(supabase, {
                  tenantId: tenant.id,
                  processoId: processo.id,
                  texto: textoCompleto,
                  campo: "prazo",
                  tribunal: tribunalUsado,
                  contextoProcesso: { classe: fresh.classe?.nome ?? "", tribunal: tribunalUsado, tipo: mov.nome },
                  contextoUrgencia: { prazoDiasDetectado: null, dataAudienciaDetectada: null },
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

  await supabase.from("motor_extracao_log").insert({
    tipo: "poll_datajud_finalizado",
    detalhes: resultado,
  });

  return NextResponse.json(resultado);
}
