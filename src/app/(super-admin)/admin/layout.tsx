import Link from "next/link";
import { BarChart3, Building2, ClipboardList, Shield } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { cn } from "@/lib/utils";

const adminLinks = [
  { href: "/admin", label: "Resumo", icon: BarChart3 },
  { href: "/admin/tenants", label: "Ambientes", icon: Building2 },
  { href: "/admin/audit", label: "Auditoria", icon: ClipboardList },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireSuperAdmin();

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background px-4 py-6 md:block">
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <Shield className="h-5 w-5 text-primary" />
          JudiCore Control
        </Link>
        <nav className="mt-8 space-y-1">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="px-5 py-6 md:ml-64 md:px-8">{children}</main>
    </div>
  );
}
