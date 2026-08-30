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

  const [{ data: members, error: membersErr }, { data: invites, error: invitesErr }] = await Promise.all([
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

  if (membersErr) {
    console.error("[equipe-page] members query error:", membersErr);
  }
  if (invitesErr) {
    console.error("[equipe-page] invites query error:", invitesErr);
  }

  const invitesWithNames = await Promise.all(
    (invites ?? []).map(async (invite) => {
      if (!invite.invited_by) return { ...invite, invited_by_name: null };
      const { data: inviter } = await supabase
        .from("users")
        .select("name")
        .eq("id", invite.invited_by)
        .maybeSingle();
      return { ...invite, invited_by_name: inviter?.name ?? null };
    })
  );

  return (
    <EquipeForm
      members={members ?? []}
      invites={invitesWithNames}
      currentUserId={authUser.id}
    />
  );
}
