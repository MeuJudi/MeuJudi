export type AuthScope = "tenant" | "admin";

export const ADMIN_AUTH_COOKIE = "meujudi-admin-auth";

// [legado] Acesso de suporte somente-leitura, por tenant (sem escolher uma
// pessoa). Substituído em 31/08/2026 por IMPERSONATE_USER_COOKIE (acesso
// completo, como uma pessoa específica) — nada mais seta este cookie, mas
// isSupportMode()/assertTenantWritable() (src/lib/auth/access.ts) continuam
// checando por ele como rede de segurança inerte.
export const SUPPORT_TENANT_COOKIE = "meujudi-support-tenant";

// Super Admin "entrando como" um usuário específico de um tenant — acesso
// completo (não somente-leitura), pensado pra suporte resolver problema no
// lugar do cliente. Ver src/lib/auth/guards.ts (requireAppUser) e
// src/app/(super-admin)/admin/actions.ts (impersonateUser/exitImpersonation).
export const IMPERSONATE_USER_COOKIE = "meujudi-impersonate-user";
