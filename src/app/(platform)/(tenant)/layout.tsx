import { TenantShell } from "@/components/tenant/tenant-shell";
import { requireAppUser } from "@/lib/auth/guards";

export default async function TenantLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { profile } = await requireAppUser();

  return (
    <TenantShell userName={profile.name} role={profile.role}>
      {children}
    </TenantShell>
  );
}
