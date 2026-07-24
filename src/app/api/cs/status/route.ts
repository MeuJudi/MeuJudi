import { NextResponse } from "next/server";
import { requireAppUser } from "@/lib/auth/guards";

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

export async function GET() {
  const { supabase, profile } = await requireAppUser();

  if (!profile.tenant_id && profile.role !== "super_admin") {
    return NextResponse.json({ error: "tenant_nao_encontrado" }, { status: 400 });
  }

  let query = supabase
    .from("cs_devices")
    .select("id, device_name, status, last_heartbeat, last_activity, pending_tasks, app_version")
    .is("revoked_at", null)
    .order("last_heartbeat", { ascending: false, nullsFirst: false });

  if (profile.tenant_id) query = query.eq("tenant_id", profile.tenant_id);

  const { data: devices, error } = await query;
  if (error) {
    console.error("[cs/status] falha ao consultar dispositivos:", error);
    return NextResponse.json({ error: "status_indisponivel" }, { status: 500 });
  }

  const now = Date.now();
  const result = (devices ?? []).map((device) => {
    const lastHeartbeat = device.last_heartbeat ? new Date(device.last_heartbeat).getTime() : 0;
    const online = device.status === "online" && now - lastHeartbeat <= ONLINE_WINDOW_MS;
    return {
      ...device,
      online,
      status: online ? device.status : "offline",
    };
  });

  return NextResponse.json({
    online: result.some((device) => device.online),
    devices: result,
    checkedAt: new Date(now).toISOString(),
  });
}
