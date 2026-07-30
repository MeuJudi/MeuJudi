import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const REQUEST_COLUMNS = "id, processo_documento_id, cnj, pdpj_documento_id, status";

/**
 * POST /api/cs/document-requests/claim
 *
 * Reserva um pedido específico (id no body) pro device autenticado. O CS
 * chega aqui depois de acordar via Realtime (que é só a campainha, nunca
 * confiável por si só) — este UPDATE atômico é a fonte de verdade: só
 * afeta a linha se ela ainda estiver `pending`, então dois devices do
 * mesmo tenant (ou uma corrida entre o evento Realtime e um retry) nunca
 * buscam o mesmo documento duas vezes.
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

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 });

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("document_fetch_requests")
    .update({ status: "claimed", device_id: device.deviceId, updated_at: now })
    .eq("id", id)
    .eq("tenant_id", device.tenantId)
    .eq("status", "pending")
    .select(REQUEST_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[cs/document-requests/claim] falha ao reservar pedido:", error);
    return NextResponse.json({ error: "pedido_indisponivel" }, { status: 500 });
  }
  if (!updated) return NextResponse.json({ error: "pedido_ja_reservado_ou_inexistente" }, { status: 409 });

  return NextResponse.json({ request: updated });
}
