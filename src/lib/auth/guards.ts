import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AuthScope } from "@/lib/supabase/auth-scope";

type AppUser = {
  id: string;
  tenant_id: string | null;
  role: "owner" | "lawyer" | "intern" | "staff" | "super_admin";
  name: string;
  email: string;
  phone: string | null;
  oab_number: string | null;
  oab_uf: string | null;
  avatar_url: string | null;
  gender: "masculine" | "feminine" | "neutral";
  created_at: string;
};

export async function requireSession(scope: AuthScope = "tenant") {
  const supabase = await createClient(scope);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return { supabase, authUser: user };
}

export async function requireAppUser(scope: AuthScope = "tenant") {
  const { supabase, authUser } = await requireSession(scope);
  const { data: profile } = await supabase
    .from("users")
    .select("id, tenant_id, role, name, email, phone, oab_number, oab_uf, avatar_url, gender, created_at")
    .eq("id", authUser.id)
    .single<AppUser>();

  if (!profile) redirect("/onboarding");

  return { supabase, authUser, profile };
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
    redirect("/monitoramento");
  }

  return context;
}
