import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type DeviceAuth = { tenantId: string; deviceId: string };

export async function autenticarDevice(supabase: SupabaseClient, request: NextRequest): Promise<DeviceAuth | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token || token.length < 32) return null;

  const tokenHash = createHash("sha256").update(token, "utf8").digest("hex");
  const { data: device } = await supabase
    .from("cs_devices")
    .select("id, tenant_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!device) return null;

  await supabase.from("cs_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  return { tenantId: device.tenant_id as string, deviceId: device.id as string };
}
