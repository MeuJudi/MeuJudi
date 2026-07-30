import jwt from "jsonwebtoken";

/**
 * Token curto (15min) que o CS usa só pra autenticar o socket do Supabase
 * Realtime — nunca pra mutação. É a "campainha" que avisa o CS na hora que
 * chega um pedido de documento, em vez do poll de 30s da fila normal.
 *
 * Não é uma sessão de public.users (o device não tem linha lá): o claim
 * custom `tenant_id` é o que a policy RLS de document_fetch_requests lê
 * direto de auth.jwt(), sem passar por current_user_tenant_id().
 */
export function mintDeviceRealtimeToken(deviceId: string, tenantId: string): string {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) throw new Error("SUPABASE_JWT_SECRET nao configurado");

  return jwt.sign(
    { sub: deviceId, role: "authenticated", tenant_id: tenantId },
    secret,
    { algorithm: "HS256", audience: "authenticated", expiresIn: "15m" },
  );
}
