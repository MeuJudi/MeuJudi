import { AuthShell } from "@/components/auth/auth-shell";

export default function SuperAdminAuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell variant="admin"><div className="w-full max-w-[580px]">{children}</div></AuthShell>;
}
