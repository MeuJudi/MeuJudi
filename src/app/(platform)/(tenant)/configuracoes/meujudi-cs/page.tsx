import { requireOwner } from "@/lib/auth/guards";
import { getActiveCsRelease } from "@/app/(super-admin)/admin/cs-releases/actions";
import { PairingPanel } from "./pairing-panel";
import { CsDownloadSection } from "./cs-download-section";

export default async function MeuJudiCsPage() {
  const { supabase, profile } = await requireOwner();
  if (!profile.tenant_id)
    return (
      <p className="text-sm text-[var(--color-muted-foreground)]">
        Usuario sem escritorio vinculado.
      </p>
    );

  const { data: devices } = await supabase
    .from("cs_devices")
    .select("id, device_name, created_at, last_seen_at")
    .eq("tenant_id", profile.tenant_id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const release = await getActiveCsRelease();

  return (
    <div className="space-y-6">
      <CsDownloadSection release={release} />
      <PairingPanel devices={devices ?? []} />
    </div>
  );
}
