"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/configuracoes/perfil", label: "Meu perfil" },
  { href: "/configuracoes/escritorio", label: "Escrit\u00f3rio" },
  { href: "/configuracoes/meujudi-cs", label: "MeuJudi CS" },
  { href: "/configuracoes/oabs", label: "OABs" },
  { href: "/configuracoes/honorarios", label: "Honor\u00e1rios" },
  { href: "/configuracoes/equipe", label: "Equipe" },
  { href: "/configuracoes/seguranca", label: "Seguran\u00e7a" },
  { href: "/configuracoes/notificacoes", label: "Notifica\u00e7\u00f5es" },
];

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">
          Configura\u00e7\u00f5es
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          Gerencie seu perfil, dados do escrit\u00f3rio, equipe e prefer\u00eancias.
        </p>
      </header>

      <nav className="hidden gap-1 border-b border-[var(--tenant-line)] md:flex">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors",
              pathname === tab.href
                ? "border-b-2 border-[var(--tenant-brass)] text-[var(--tenant-brass)]"
                : "text-[var(--color-muted-foreground)] hover:text-[var(--color-card-foreground)]"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <select
        value={pathname}
        onChange={(e) => {
          window.location.href = e.target.value;
        }}
        className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-[var(--color-card-foreground)] md:hidden"
      >
        {tabs.map((tab) => (
          <option key={tab.href} value={tab.href}>
            {tab.label}
          </option>
        ))}
      </select>

      <div>{children}</div>
    </div>
  );
}
