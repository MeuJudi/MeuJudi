import { cookies } from "next/headers";
import { SUPPORT_TENANT_COOKIE } from "@/lib/supabase/auth-scope";

// [legado, 31/08/2026] Nada mais seta SUPPORT_TENANT_COOKIE — substituído
// por IMPERSONATE_USER_COOKIE (acesso completo, como uma pessoa específica,
// ver src/lib/auth/guards.ts). Mantido como rede de segurança inerte; se um
// modo somente-leitura for reintroduzido no futuro, é aqui que ele plugaria.
export async function isSupportMode() {
  return Boolean((await cookies()).get(SUPPORT_TENANT_COOKIE)?.value);
}

export async function assertTenantWritable() {
  if (await isSupportMode()) throw new Error("O Acesso de suporte é somente visualização.");
}

