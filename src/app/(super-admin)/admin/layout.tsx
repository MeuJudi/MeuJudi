import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3, Building2, CalendarClock, ClipboardList, MonitorCog, Shield } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { adminSignOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/admin", label: "Resumo", icon: BarChart3 },
  { href: "/admin/tenants", label: "Clientes", icon: Building2 },
  { href: "/admin/cs-diagnostics", label: "CS Diagnosticos", icon: MonitorCog },
  { href: "/admin/audit", label: "Auditoria", icon: ClipboardList },
  { href: "/admin/maintenance", label: "Manutenção", icon: CalendarClock },
];

export const metadata: Metadata = {
  title: "Super Admin",
  icons: {
    icon: [{ url: "/admin-favicon.svg", type: "image/svg+xml" }],
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background px-4 py-6 md:block">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5 text-primary" />
          Super Admin
        </Link>
        <nav className="mt-8 space-y-1">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--tenant-brass)]",
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>
        <form action={adminSignOut} className="absolute bottom-6 left-4 right-4">
          <button type="submit" className="w-full rounded-md border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            Sair do Super Admin
          </button>
        </form>
      </aside>
      <main className="px-5 py-6 md:ml-64 md:px-8">{children}</main>
    </div>
  );
}
