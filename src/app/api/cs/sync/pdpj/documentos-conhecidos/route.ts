import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * POST /api/cs/sync/pdpj/documentos-conhecidos
 *
 * "Pulo inteligente" (ver docs/roadmap/24-crons-sincronizacao-automatica-
 * pdpj.md) — antes de baixar o texto de cada documento de um processo
 * (chamada cara, via janela Chromium autenticada), o CS pergunta aqui quais
 * `pdpjDocumentoId` (UUID estável do documento no Codex do PDPJ, extraído
 * de hrefBinario OU hrefTexto) já existem em `processo_documentos`. O que
 * vier de volta é pulado — só documento genuinamente novo tem o texto
 * baixado.
 *
 * Antes checava por hash de `hrefBinario` — documento só com `hrefTexto`
 * (sem link de binário) nunca tinha hash pra checar, então nunca era
 * dedupado (achado 31/07/2026). `pdpjDocumentoId` cobre os dois casos.
 *
 * Sem processo encontrado (ex.: primeira sincronização de um CNJ recém-
 * descoberto), devolve lista vazia — tudo é tratado como novo, comportamento
 * seguro por padrão.
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
  const documentIds = Array.isArray(body.documentIds)
    ? body.documentIds.filter((h): h is string => typeof h === "string").slice(0, 500)
    : [];
  if (cnj.length !== 20 || documentIds.length === 0) {
    return NextResponse.json({ conhecidos: [] });
  }

  const { data: processo } = await supabase
    .from("processos")
    .select("id")
    .eq("tenant_id", device.tenantId)
    .eq("cnj", cnj)
    .maybeSingle();

  if (!processo) return NextResponse.json({ conhecidos: [] });

  const { data: existentes, error } = await supabase
    .from("processo_documentos")
    .select("pdpj_documento_id")
    .eq("tenant_id", device.tenantId)
    .eq("processo_id", processo.id)
    .in("pdpj_documento_id", documentIds);

  if (error) {
    console.error("[cs/sync/pdpj/documentos-conhecidos] falha ao consultar:", error);
    return NextResponse.json({ conhecidos: [] });
  }

  return NextResponse.json({ conhecidos: (existentes ?? []).map((row) => row.pdpj_documento_id) });
}
