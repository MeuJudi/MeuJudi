import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

/**
 * POST /api/cs/document-requests/{id}/upload-url
 *
 * Devolve uma signed upload URL pro CS subir o PDF DIRETO pro Storage —
 * sem passar o binário (nem em base64) pelo corpo de uma rota do Next.js.
 * Antes o CS mandava o base64 pra cá e essa rota subia pro Storage
 * (dois saltos em série: CS->Vercel, Vercel->Storage); medido em produção
 * isso sozinho levava ~0,8-1,2s. Com upload direto, o Vercel só troca
 * mensagens de controle pequenas (esta rota e /complete), o binário vai
 * direto CS->Storage.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { id } = await context.params;
  const { data: pedido, error } = await supabase
    .from("document_fetch_requests")
    .select("id")
    .eq("id", id)
    .eq("tenant_id", device.tenantId)
    .eq("device_id", device.deviceId)
    .in("status", ["claimed", "fetching"])
    .maybeSingle();
  if (error) {
    console.error("[cs/document-requests/upload-url] falha ao validar pedido:", error);
    return NextResponse.json({ error: "pedido_indisponivel" }, { status: 500 });
  }
  if (!pedido) return NextResponse.json({ error: "pedido_nao_reservado_por_este_device" }, { status: 409 });

  const storagePath = `${device.tenantId}/${id}.pdf`;
  const { data: signed, error: signError } = await supabase.storage
    .from("documentos-temp")
    .createSignedUploadUrl(storagePath, { upsert: true });
  if (signError || !signed) {
    console.error("[cs/document-requests/upload-url] falha ao gerar signed upload URL:", signError);
    return NextResponse.json({ error: "upload_url_indisponivel" }, { status: 500 });
  }

  return NextResponse.json({ path: signed.path, token: signed.token });
}
