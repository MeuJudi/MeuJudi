import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

const MAX_ENTRIES = 5000;
const MAX_PERIOD_DAYS = 31;

type LogEntryPayload = {
  timestamp?: unknown;
  level?: unknown;
  message?: unknown;
  context?: unknown;
};

/**
 * POST /api/cs/logs/upload
 *
 * Envio sob demanda (nunca automatico) dos logs locais do MeuJudi Sync,
 * disparado manualmente pelo usuario escolhendo um periodo na tela do CS.
 * Só aceita o envio se `cs_devices.log_upload_enabled` estiver true pra
 * aquele dispositivo especifico — liberado manualmente pelo Super Admin
 * (ver /admin/cs-diagnostics). O toggle no CS que mostra/esconde o botao é
 * só UX; esse gate aqui é o que realmente decide.
 */
export async function POST(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  if (!device.logUploadEnabled) {
    return NextResponse.json({ error: "envio_de_logs_nao_liberado" }, { status: 403 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo_invalido" }, { status: 400 });
  }

  const periodStart = typeof body.periodStart === "string" ? new Date(body.periodStart) : null;
  const periodEnd = typeof body.periodEnd === "string" ? new Date(body.periodEnd) : null;
  if (!periodStart || !periodEnd || Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return NextResponse.json({ error: "periodo_invalido" }, { status: 400 });
  }
  if (periodEnd <= periodStart) {
    return NextResponse.json({ error: "periodo_invalido" }, { status: 400 });
  }
  const periodDays = (periodEnd.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000);
  if (periodDays > MAX_PERIOD_DAYS) {
    return NextResponse.json({ error: `periodo_maximo_de_${MAX_PERIOD_DAYS}_dias` }, { status: 400 });
  }

  const rawEntries = Array.isArray(body.entries) ? (body.entries as LogEntryPayload[]) : [];
  if (rawEntries.length === 0) {
    return NextResponse.json({ error: "sem_entradas_no_periodo" }, { status: 400 });
  }
  if (rawEntries.length > MAX_ENTRIES) {
    return NextResponse.json({ error: `maximo_de_${MAX_ENTRIES}_entradas` }, { status: 413 });
  }

  const entries = rawEntries
    .filter((entry) => typeof entry.timestamp === "string" && typeof entry.level === "string" && typeof entry.message === "string")
    .map((entry) => ({
      timestamp: (entry.timestamp as string).slice(0, 40),
      level: (entry.level as string).slice(0, 10),
      message: (entry.message as string).slice(0, 1000),
      context: entry.context ?? null,
    }));

  const { data: inserted, error } = await supabase
    .from("cs_log_uploads")
    .insert({
      tenant_id: device.tenantId,
      device_id: device.deviceId,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      entry_count: entries.length,
      entries,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[cs/logs/upload] falha ao gravar upload:", error);
    return NextResponse.json({ error: "falha_ao_gravar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted.id, entryCount: entries.length });
}
