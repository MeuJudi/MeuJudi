import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * POST /api/cs/document-requests/{id}/complete
 *
 * Fecha um pedido sob demanda. O binário já foi direto do CS pro Storage
 * via signed upload URL (ver /upload-url) — essa rota só confirma que
 * chegou e marca a linha como pronta (ou registra a falha). Nunca recebe
 * o PDF no corpo; isso evitava um salto a mais (CS->Vercel->Storage) que,
 * medido em produção, levava ~0,8-1,2s sozinho.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo_invalido" }, { status: 400 });
  }

  const status = body.status === "done" ? "done" : body.status === "failed" ? "failed" : "";
  if (!status) return NextResponse.json({ error: "status_invalido" }, { status: 400 });

  const now = new Date().toISOString();

  if (status === "failed") {
    const errorMessage = typeof body.errorMessage === "string" ? body.errorMessage.slice(0, 500) : "Falha ao buscar o documento.";
    const { data: updated, error } = await supabase
      .from("document_fetch_requests")
      .update({ status: "failed", error_message: errorMessage, updated_at: now })
      .eq("id", id)
      .eq("tenant_id", device.tenantId)
      .eq("device_id", device.deviceId)
      .in("status", ["claimed", "fetching"])
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[cs/document-requests/complete] falha ao marcar erro:", error);
      return NextResponse.json({ error: "conclusao_nao_registrada" }, { status: 500 });
    }
    if (!updated) return NextResponse.json({ error: "pedido_nao_reservado_por_este_device" }, { status: 409 });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const storagePath = `${device.tenantId}/${id}.pdf`;
  const { data: updated, error } = await supabase
    .from("document_fetch_requests")
    .update({ status: "done", storage_path: storagePath, updated_at: now })
    .eq("id", id)
    .eq("tenant_id", device.tenantId)
    .eq("device_id", device.deviceId)
    .in("status", ["claimed", "fetching"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[cs/document-requests/complete] falha ao concluir pedido:", error);
    return NextResponse.json({ error: "conclusao_nao_registrada" }, { status: 500 });
  }
  if (!updated) {
    // A linha não estava mais reservada por este device — desfaz o upload
    // órfão em vez de deixar lixo no bucket temporário.
    await supabase.storage.from("documentos-temp").remove([storagePath]).catch(() => undefined);
    return NextResponse.json({ error: "pedido_nao_reservado_por_este_device" }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: "done" });
}
