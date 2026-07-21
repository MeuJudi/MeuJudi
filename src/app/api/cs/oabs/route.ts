import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { autenticarDevice } from "@/lib/cs/device-auth";

export async function GET(request: NextRequest) {
  const supabase = createServiceClient();
  const device = await autenticarDevice(supabase, request);
  if (!device) return NextResponse.json({ error: "device_nao_autorizado" }, { status: 401 });

  const { data, error } = await supabase
    .from("escritorio_oabs")
    .select("id, oab_number, oab_uf")
    .eq("tenant_id", device.tenantId)
    .eq("is_active", true)
    .order("oab_number");
  if (error) return NextResponse.json({ error: "oabs_nao_carregadas" }, { status: 500 });
  return NextResponse.json({ oabs: data ?? [] });
}
