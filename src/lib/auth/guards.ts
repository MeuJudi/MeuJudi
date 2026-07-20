import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function requireSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return { supabase, authUser: user };
}

export async function requireAppUser() {
  const { supabase, authUser } = await requireSession();
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
  const context = await requireAppUser();

  if (context.profile.role !== "super_admin") {
    redirect("/monitoramento");
  }

  return context;
}
