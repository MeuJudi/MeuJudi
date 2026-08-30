import { requireOwner } from "@/lib/auth/guards";
import { EquipeForm } from "./equipe-form";

export default async function EquipePage() {
  let supabase, profile, authUser;
  try {
    const ctx = await requireOwner();
    supabase = ctx.supabase;
    profile = ctx.profile;
    authUser = ctx.authUser;
  } catch (err) {
    console.error("[equipe-page] requireOwner failed:", err);
    throw err;
  }

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, gender, is_active, avatar_url, last_login_at")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_invites")
      .select("id, email, role, status, expires_at, invited_by")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
  ]);

  const invitesWithNames: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string;
    invited_by_name: string | null;
  }> = [];

  for (const invite of invites ?? []) {
    try {
      if (!invite.invited_by) {
        invitesWithNames.push({ ...invite, invited_by_name: null });
        continue;
      }
      const { data: inviter } = await supabase
        .from("users")
        .select("name")
        .eq("id", invite.invited_by)
        .maybeSingle();
      invitesWithNames.push({ ...invite, invited_by_name: inviter?.name ?? null });
    } catch {
      invitesWithNames.push({ ...invite, invited_by_name: null });
    }
  }

  return (
    <EquipeForm
      members={members ?? []}
      invites={invitesWithNames}
      currentUserId={authUser.id}
    />
  );
}
