import { cookies } from "next/headers";
import { SUPPORT_TENANT_COOKIE } from "@/lib/supabase/auth-scope";

export async function isSupportMode() {
  return Boolean((await cookies()).get(SUPPORT_TENANT_COOKIE)?.value);
}

export async function assertTenantWritable() {
  if (await isSupportMode()) throw new Error("O Acesso de suporte é somente visualização.");
}

