import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

// Vercel Serverless Functions tem limite de payload (~4.5MB) — base64
// infla ~33%, então isso cobre PDFs de até uns ~3MB decodificados. Acima
// disso o CS recebe erro claro em vez de um 413 silencioso do host; se
// isso virar problema real (documentos grandes), o caminho é trocar por
// signed-upload-URL (CS sobe direto pro Storage, sem passar pelo Next.js).
const MAX_BASE64_LENGTH = 4_500_000;

/**
 * POST /api/cs/document-requests/{id}/complete
 *
 * Fecha um pedido sob demanda: em caso de sucesso, recebe o PDF em base64
 * (o CS não consegue devolver Buffer/Blob bruto de dentro do
 * `executeJavaScript` do Electron), decodifica e sobe pro bucket privado
 * `documentos-temp` com o service role — o navegador nunca recebe isso
 * direto, só uma signed URL de vida curta gerada depois, sob demanda.
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

  const base64 = typeof body.base64 === "string" ? body.base64 : "";
  if (!base64) return NextResponse.json({ error: "base64_obrigatorio" }, { status: 400 });
  if (base64.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: "documento_muito_grande" }, { status: 413 });
  }

  const storagePath = `${device.tenantId}/${id}.pdf`;
  const bytes = Buffer.from(base64, "base64");
  const { error: uploadError } = await supabase.storage
    .from("documentos-temp")
    .upload(storagePath, bytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) {
    console.error("[cs/document-requests/complete] falha ao subir pro Storage:", uploadError);
    return NextResponse.json({ error: "upload_falhou" }, { status: 500 });
  }

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
