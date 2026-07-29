import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const MAX_LINKS_PER_REQUEST = 50;

/**
 * POST /api/cs/sync/pdpj
 *
 * Recebe o resultado de uma tarefa `pdpj_cnj` (detalhe de processo
 * consultado no Portal PDPJ): garante que o processo existe na tabela
 * `processos` do tenant (`ultima_sync_pje` atualizado) e persiste os links
 * de documentos oficiais descobertos em `processo_documentos`, com
 * deduplicação por hash da URL — Fase 8 de
 * docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md.
 *
 * Nunca recebe nem grava o PDF em si — só o link oficial pro advogado
 * baixar direto do portal. Metadados de classe/órgão/partes continuam de
 * fora (sem schema oficial confirmado do PDPJ, ver cs-pdpj-login-fix.md);
 * texto de peça pra Regex/IA também fica pra quando existir um endpoint
 * confirmado de conteúdo — hoje o PDPJ só entrega o link, não o texto.
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

  const documentLinks = selecionarLinksValidos(body.documentLinks);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("processos")
    .select("id")
    .eq("tenant_id", device.tenantId)
    .eq("cnj", cnj)
    .maybeSingle();

  let processoId = existing?.id as string | undefined;

  if (processoId) {
    const { error } = await supabase
      .from("processos")
      .update({ ultima_sync_pje: now })
      .eq("id", processoId)
      .eq("tenant_id", device.tenantId);
    if (error) {
      console.error("[cs/sync/pdpj] falha ao atualizar processo:", error);
      return NextResponse.json({ error: "processo_nao_atualizado" }, { status: 500 });
    }
  } else {
    const { data: inserted, error } = await supabase
      .from("processos")
      .insert({ tenant_id: device.tenantId, cnj, source_context: "private_cs", ultima_sync_pje: now })
      .select("id")
      .maybeSingle();
    if (error) {
      // 23505 = unique_violation (tenant_id, cnj) — corrida com outra tarefa; recupera o id existente.
      if (error.code === "23505") {
        const { data: refetched } = await supabase.from("processos").select("id").eq("tenant_id", device.tenantId).eq("cnj", cnj).maybeSingle();
        processoId = refetched?.id;
      } else {
        console.error("[cs/sync/pdpj] falha ao criar processo:", error);
        return NextResponse.json({ error: "processo_nao_criado" }, { status: 500 });
      }
    } else {
      processoId = inserted?.id;
    }
  }

  let documentosSalvos = 0;
  if (processoId && documentLinks.length > 0) {
    const rows = documentLinks.map((url) => ({
      tenant_id: device.tenantId,
      processo_id: processoId!,
      fonte: "pdpj" as const,
      url,
      url_hash: createHash("sha256").update(url, "utf-8").digest("hex"),
    }));
    // upsert com ignoreDuplicates: um link já visto (mesmo hash) não gera erro nem duplicata.
    const { error: docsError, count } = await supabase
      .from("processo_documentos")
      .upsert(rows, { onConflict: "tenant_id,processo_id,url_hash", ignoreDuplicates: true, count: "exact" });
    if (docsError) {
      console.error("[cs/sync/pdpj] falha ao salvar documentos:", docsError);
    } else {
      documentosSalvos = count ?? 0;
    }
  }

  return NextResponse.json({ ok: true, processoId, created: !existing, documentosSalvos, documentLinksRecebidos: documentLinks.length });
}

/**
 * Só aceita URLs https do próprio domínio do Portal PDPJ que apontem pra
 * algo com cara de documento/peça — descarta links genéricos, vazios ou
 * de outros domínios que às vezes aparecem espalhados na resposta bruta.
 */
function selecionarLinksValidos(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const vistos = new Set<string>();
  const validos: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || validos.length >= MAX_LINKS_PER_REQUEST) continue;
    const url = item.trim();
    if (!url || vistos.has(url)) continue;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:") continue;
    if (!parsed.hostname.endsWith("pdpj.jus.br")) continue;
    if (!/documento/i.test(parsed.pathname)) continue;
    vistos.add(url);
    validos.push(url);
  }
  return validos;
}
