import type { SupabaseClient } from "@supabase/supabase-js";

type Fonte = "datajud" | "mural" | "pje_cs";

const crawlerPorFonte: Record<Fonte, string> = {
  datajud: "datajud_publico",
  mural: "mural_cs",
  pje_cs: "pje_trt9_cs",
};

export async function iniciarExecucaoFonte(
  supabase: SupabaseClient,
  fonte: Fonte,
  options: { tenantId?: string | null; tribunalSigla?: string | null; metadata?: Record<string, unknown> } = {},
) {
  try {
    const { data: crawler } = await supabase.from("crawlers").select("id").eq("codigo", crawlerPorFonte[fonte]).maybeSingle();
    if (!crawler) return null;
    let tribunalId: string | null = null;
    if (options.tribunalSigla) {
      const { data: tribunal } = await supabase.from("tribunais").select("id").eq("sigla", options.tribunalSigla.trim().toUpperCase()).maybeSingle();
      tribunalId = tribunal?.id ?? null;
    }
    const { data: run } = await supabase.from("source_sync_runs").insert({
      tenant_id: options.tenantId ?? null,
      crawler_id: crawler.id,
      tribunal_id: tribunalId,
      status: "running",
      started_at: new Date().toISOString(),
      attempt_count: 1,
      metadata: options.metadata ?? {},
    }).select("id,started_at").single();
    return run;
  } catch (error) {
    console.error("[cobertura] não foi possível iniciar auditoria da fonte:", error);
    return null;
  }
}

export async function finalizarExecucaoFonte(
  supabase: SupabaseClient,
  runId: string | null,
  result: { status: "completed" | "partial" | "failed"; itemsRead: number; itemsCreated: number; itemsUpdated?: number; lastError?: string | null; metadata?: Record<string, unknown> },
  startedAt: number,
) {
  if (!runId) return;
  try {
    await supabase.from("source_sync_runs").update({
      status: result.status,
      finished_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
      items_read: result.itemsRead,
      items_created: result.itemsCreated,
      items_updated: result.itemsUpdated ?? 0,
      last_error: result.lastError ?? null,
      last_success_at: result.status === "failed" ? null : new Date().toISOString(),
      metadata: result.metadata ?? {},
      updated_at: new Date().toISOString(),
    }).eq("id", runId);
  } catch (error) {
    console.error("[cobertura] não foi possível finalizar auditoria da fonte:", error);
  }
}

/** Vincula um processo ao catálogo global sem alterar seus campos legados. */
export async function vincularProcessoAoCatalogo(
  supabase: SupabaseClient,
  processoId: string,
  tribunalSigla: string | null | undefined,
  fonte: Fonte,
) {
  if (!tribunalSigla) return null;
  try {
    const sigla = tribunalSigla.trim().toUpperCase();
    const { data: tribunal, error: tribunalError } = await supabase
      .from("tribunais")
      .select("id, sistema_principal_id")
      .eq("sigla", sigla)
      .maybeSingle();
    if (tribunalError) throw tribunalError;
    if (!tribunal) return null;

    const { data: crawler, error: crawlerError } = await supabase
      .from("crawlers")
      .select("id, versao, sistema_id")
      .eq("codigo", crawlerPorFonte[fonte])
      .maybeSingle();

    if (crawlerError) throw crawlerError;

    const update = {
      tribunal_id: tribunal.id,
      sistema_id: crawler?.sistema_id ?? tribunal.sistema_principal_id,
      crawler_id: crawler?.id ?? null,
      origem_extracao: fonte,
      status_extracao: "sucesso",
      versao_crawler: crawler?.versao ?? null,
      data_extracao: new Date().toISOString(),
    };
    const { error } = await supabase.from("processos").update(update).eq("id", processoId);
    if (error) throw error;
    return tribunal.id as string;
  } catch (error) {
    console.error(`[cobertura] falha ao vincular processo ${processoId}:`, error);
    return null;
  }
}

/** Recalcula somente a evidência observada, preservando decisões administrativas. */
export async function reconciliarCoberturaTribunal(supabase: SupabaseClient, tribunalId: string, fonte: Fonte) {
  const { data: tribunal, error: tribunalError } = await supabase.from("tribunais").select("sigla").eq("id", tribunalId).maybeSingle();
  if (tribunalError) throw tribunalError;
  if (!tribunal) return;

  const crawlerCodigo = crawlerPorFonte[fonte];
  const { data: crawler, error: crawlerError } = await supabase.from("crawlers").select("id").eq("codigo", crawlerCodigo).maybeSingle();
  if (crawlerError) throw crawlerError;
  if (!crawler) return;

  const processosQuery = supabase.from("processos").select("id", { count: "exact", head: true }).eq("tribunal_id", tribunalId).eq("origem_extracao", fonte);
  const comunicacoesQuery = fonte === "mural"
    ? supabase.from("comunicacoes_mural").select("id", { count: "exact", head: true }).eq("sigla_tribunal", tribunal.sigla)
    : Promise.resolve({ count: 0, error: null });
  const [{ count: processos, error: processosError }, { count: comunicacoes, error: comunicacoesError }, { data: linhas, error: linhasError }] = await Promise.all([
    processosQuery,
    comunicacoesQuery,
    supabase.from("tribunal_coverage").select("id,status,meujudi_validado,evidencia").eq("tribunal_id", tribunalId).eq("crawler_id", crawler.id),
  ]);
  if (processosError) throw processosError;
  if (comunicacoesError) throw comunicacoesError;
  if (linhasError) throw linhasError;

  for (const linha of linhas ?? []) {
    const evidencia = (linha.evidencia ?? {}) as Record<string, unknown>;
    const totalProcessos = processos ?? 0;
    const totalComunicacoes = comunicacoes ?? 0;
    const status = linha.meujudi_validado
      ? "validado"
      : linha.status === "bloqueado" || linha.status === "validado" || linha.status === "em_validacao"
        ? linha.status
        : totalProcessos > 0 || totalComunicacoes > 0 ? "parcial" : linha.status;

    const { error: updateError } = await supabase.from("tribunal_coverage").update({
      processo_encontrado_no_teste: totalProcessos > 0,
      status,
      evidencia: {
        ...evidencia,
        processos: totalProcessos,
        comunicacoes_mural: totalComunicacoes,
        fonte,
        evidencia_atualizada_em: new Date().toISOString(),
        reconcilicao_automatica: true,
      },
      updated_at: new Date().toISOString(),
    }).eq("id", linha.id);
    if (updateError) throw updateError;
  }
}

export async function reconciliarCoberturaPorSiglas(supabase: SupabaseClient, siglas: Iterable<string>, fonte: Fonte) {
  const unicas = [...new Set([...siglas].map((sigla) => sigla.trim().toUpperCase()).filter(Boolean))];
  for (const sigla of unicas) {
    const { data: tribunal, error } = await supabase.from("tribunais").select("id").eq("sigla", sigla).maybeSingle();
    if (error) throw error;
    if (tribunal) await reconciliarCoberturaTribunal(supabase, tribunal.id, fonte);
  }
}
