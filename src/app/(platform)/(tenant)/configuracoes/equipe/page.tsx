import { requireOwner } from "@/lib/auth/guards";
import { EquipeForm } from "./equipe-form";

export default async function EquipePage() {
  const { supabase, profile, authUser } = await requireOwner();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, is_active, avatar_url, last_login_at")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_invites")
      .select("id, email, role, status, expires_at, invited_by")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
  ]);

  const invitesWithNames = await Promise.all(
    (invites ?? []).map(async (invite) => {
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
