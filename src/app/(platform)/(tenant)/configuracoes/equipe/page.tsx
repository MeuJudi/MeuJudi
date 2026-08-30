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
    console.error("[equipe-page] requireOwner failed:", err instanceof Error ? err.message : err);
    throw err;
  }

  let members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    is_active: boolean;
    avatar_url: string | null;
    last_login_at: string | null;
    oab_number: string | null;
    oab_uf: string | null;
  }> = [];

  const invitesWithNames: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string;
    invited_by_name: string | null;
  }> = [];

  try {
    const membersResult = await supabase
      .from("users")
      .select("id, name, email, role, is_active, avatar_url, last_login_at, oab_number, oab_uf")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (membersResult.error) {
      console.error("[equipe-page] members query error:", membersResult.error.message, membersResult.error.code);
    }
    if (membersResult.data) {
      members = membersResult.data;
    }
  } catch (err) {
    console.error("[equipe-page] members query failed:", err instanceof Error ? err.message : err);
  }

  try {
    const invitesResult = await supabase
      .from("tenant_invites")
      .select("id, email, role, status, expires_at, invited_by")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false });

    if (invitesResult.error) {
      console.error("[equipe-page] invites query error:", invitesResult.error.message, invitesResult.error.code);
    }

    const invites = invitesResult.data ?? [];

    for (const invite of invites) {
      let inviterName: string | null = null;
      if (invite.invited_by) {
        try {
          const { data: inviter } = await supabase
            .from("users")
            .select("name")
            .eq("id", invite.invited_by)
            .maybeSingle();
          inviterName = inviter?.name ?? null;
        } catch {
          inviterName = null;
        }
      }
      invitesWithNames.push({ ...invite, invited_by_name: inviterName });
    }
  } catch (err) {
    console.error("[equipe-page] invites query failed:", err);
  }

  return (
    <EquipeForm
      members={members}
      invites={invitesWithNames}
      currentUserId={authUser.id}
    />
  );
}
