import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { codigo?: unknown };
    const codigo = typeof body.codigo === "string" ? body.codigo.trim().toUpperCase() : "";
    if (!CODE_RE.test(codigo)) return NextResponse.json({ error: "codigo_invalido" }, { status: 400 });

    const supabase = createServiceClient();
    const { data: pairing, error: pairingError } = await supabase
      .from("cs_pairing_codes")
      .select("id, tenant_id, user_id, expires_at")
      .eq("codigo", codigo)
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (pairingError || !pairing) return NextResponse.json({ error: "codigo_expirado_ou_invalido" }, { status: 401 });

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const deviceName = request.headers.get("x-device-name")?.slice(0, 120) || "MeuJudi CS";
    const { data: device, error: deviceError } = await supabase
      .from("cs_devices")
      .insert({ tenant_id: pairing.tenant_id, user_id: pairing.user_id, device_name: deviceName, token_hash: tokenHash })
      .select("id")
      .single();
    if (deviceError || !device) return NextResponse.json({ error: "pareamento_nao_criado" }, { status: 500 });

    const { data: claimed, error: claimError } = await supabase
      .from("cs_pairing_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("id", pairing.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      await supabase.from("cs_devices").delete().eq("id", device.id);
      return NextResponse.json({ error: "codigo_ja_utilizado" }, { status: 409 });
    }

    const [{ data: tenant }, { data: user }] = await Promise.all([
      supabase.from("tenants").select("name").eq("id", pairing.tenant_id).maybeSingle(),
      supabase.from("users").select("name").eq("id", pairing.user_id).maybeSingle(),
    ]);
    return NextResponse.json({
      device_token: token,
      tenant_id: pairing.tenant_id,
      tenant_name: tenant?.name ?? "Escritorio",
      user_name: user?.name ?? "Usuário",
    });
  } catch (error) {
    console.error("[cs/pair] erro:", error);
    return NextResponse.json({ error: "erro_interno" }, { status: 500 });
  }
}
