import { AuthShell } from "@/components/auth/auth-shell";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthShell><div className="w-full max-w-[620px]">{children}</div></AuthShell>;
}
