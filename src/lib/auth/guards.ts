import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { IMPERSONATE_USER_COOKIE, type AuthScope } from "@/lib/supabase/auth-scope";
import { getRelevantMaintenance } from "@/lib/maintenance";
import { isSupportMode } from "@/lib/auth/access";

type AppUser = {
  id: string;
  tenant_id: string | null;
  role: "owner" | "lawyer" | "intern" | "staff" | "super_admin";
  name: string;
  nickname: string | null;
  email: string;
  phone: string | null;
  oab_number: string | null;
  oab_uf: string | null;
  avatar_url: string | null;
  gender: "masculine" | "feminine" | "neutral";
  created_at: string;
};

const APP_USER_COLUMNS = "id, tenant_id, role, name, nickname, email, phone, oab_number, oab_uf, avatar_url, gender, created_at";

export type Impersonation = { adminId: string; adminName: string } | null;

export async function requireSession(scope?: AuthScope) {
  const supabase = await createClient(scope);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(scope === "admin" ? "/admin/login" : "/login");

  return { supabase, authUser: user };
}

export async function requireAppUser(scope?: AuthScope) {
  const { supabase, authUser } = await requireSession(scope);
  const { data: adminProfile } = await supabase
    .from("users")
    .select(APP_USER_COLUMNS)
    .eq("id", authUser.id)
    .single<AppUser>();

  if (!adminProfile) redirect(scope === "admin" ? "/admin/login?error=admin_profile_missing" : "/onboarding");

  // Super Admin "entrando como" um usuário específico (acesso de suporte
  // completo — ver docs do IMPERSONATE_USER_COOKIE). `authUser` continua
  // sendo a identidade real do Super Admin (é o que a RLS via
  // is_super_admin() checa), só `profile` passa a ser da pessoa impersonada
  // — por isso toda tela que já usa `profile.tenant_id`/`profile.role`
  // funciona automaticamente em modo suporte, sem precisar de nenhum ajuste
  // caso a caso.
  let profile = adminProfile;
  let impersonating: Impersonation = null;
  if (scope !== "admin" && adminProfile.role === "super_admin") {
    const impersonateUserId = (await cookies()).get(IMPERSONATE_USER_COOKIE)?.value;
    if (impersonateUserId) {
      const { data: targetProfile } = await supabase
        .from("users")
        .select(APP_USER_COLUMNS)
        .eq("id", impersonateUserId)
        .eq("is_active", true)
        .single<AppUser>();
      if (targetProfile) {
        profile = targetProfile;
        impersonating = { adminId: adminProfile.id, adminName: adminProfile.name };
      }
    }
  }

  if (scope !== "admin" && profile.tenant_id && profile.role !== "super_admin") {
    // `current_user_tenant_is_active()` lê `auth.uid()` no banco — durante
    // impersonação isso é o Super Admin de verdade (tenant_id nulo), não a
    // pessoa impersonada, então a RPC sempre voltaria `false` e derrubaria
    // toda sessão de suporte em /tenant-suspended. Consulta direta em vez
    // da RPC quando impersonando; fora disso mantém a RPC (mesmo resultado,
    // já testado em produção).
    const tenantIsActive = impersonating
      ? (await supabase.from("tenants").select("is_active").eq("id", profile.tenant_id).maybeSingle()).data?.is_active
      : (await supabase.rpc("current_user_tenant_is_active")).data;
    if (tenantIsActive === false) redirect("/tenant-suspended");

    const activeMaintenance = await getRelevantMaintenance(supabase, profile.tenant_id, "active");
    if (activeMaintenance.length > 0) redirect("/maintenance");
  }

  return { supabase, authUser, profile, impersonating };
}

export async function requireOwner() {
  const context = await requireAppUser();

  if (context.profile.role !== "owner" && context.profile.role !== "super_admin") {
    redirect("/monitoramento");
  }

  return context;
}

export async function requireSuperAdmin() {
  const context = await requireAppUser("admin");

  if (context.profile.role !== "super_admin") {
    redirect("/admin/login?error=admin_required");
  }

  return context;
}

export async function requireWritableAppUser() {
  const context = await requireAppUser();
  if (await isSupportMode()) throw new Error("O Acesso de suporte é somente visualização.");
  return context;
}
