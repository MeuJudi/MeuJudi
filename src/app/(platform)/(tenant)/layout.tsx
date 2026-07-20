import { cookies } from "next/headers";
import { TenantShell } from "@/components/tenant/tenant-shell";
import { requireAppUser } from "@/lib/auth/guards";
import type { PaletteId } from "@/lib/themes/palettes";

const VALID_PALETTE_IDS = new Set<string>([
  "padrao", "escuro", "rosa", "lavanda", "esmeralda", "oceano", "ambar",
]);

export default async function TenantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await requireAppUser();
  const cookieStore = await cookies();
  const rawPalette = cookieStore.get("meujudi-palette")?.value;
  const paletteId: PaletteId =
    rawPalette && VALID_PALETTE_IDS.has(rawPalette) ? (rawPalette as PaletteId) : "padrao";

  return (
    <TenantShell userName={profile.name} role={profile.role} gender={profile.gender} avatarUrl={(profile as Record<string, unknown>).avatar_url as string | null} initialPaletteId={paletteId}>
      {children}
    </TenantShell>
  );
}
