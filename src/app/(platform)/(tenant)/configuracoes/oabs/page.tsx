import { requireOwner } from "@/lib/auth/guards";
import { OabsForm } from "./oabs-form";

export default async function OabsPage() {
  const { supabase, profile } = await requireOwner();

  const { data: oabs } = await supabase
    .from("escritorio_oabs")
    .select("id, oab_number, oab_uf, is_primary, user_id")
    .eq("tenant_id", profile.tenant_id)
    .order("is_primary", { ascending: false });

  const oabsWithNames = await Promise.all(
    (oabs ?? []).map(async (oab) => {
      if (!oab.user_id) return { ...oab, user_name: null };
      const { data: user } = await supabase
        .from("users")
        .select("name")
        .eq("id", oab.user_id)
        .maybeSingle();
      return { ...oab, user_name: user?.name ?? null };
    })
  );

  return (
    <OabsForm
      oabs={oabsWithNames}
      currentUserName={profile.name ?? ""}
      currentUserOabNumber={profile.oab_number ?? ""}
      currentUserOabUf={profile.oab_uf ?? ""}
    />
  );
}
