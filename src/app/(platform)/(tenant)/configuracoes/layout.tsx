"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/configuracoes/meujudi-cs", label: "MeuJudi CS" },
  { href: "/configuracoes/perfil", label: "Meu perfil" },
  { href: "/configuracoes/escritorio", label: "Escritório" },
  { href: "/configuracoes/oabs", label: "OABs" },
  { href: "/configuracoes/honorarios", label: "Honorários" },
  { href: "/configuracoes/equipe", label: "Equipe" },
  { href: "/configuracoes/seguranca", label: "Segurança" },
  { href: "/configuracoes/notificacoes", label: "Notificações" },
];

export default function ConfiguracoesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">
          Configurações
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">
          Gerencie seu perfil, dados do escritório, equipe e preferências.
        </p>
      </header>

      {/* Desktop tabs */}
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

      {/* Mobile tabs */}
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
