"use client";

import Link from "next/link";
import { MeuJudiLogo } from "./meujudi-logo";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  Eye,
  FileSearch,
  Search,
  Settings,
  UsersRound,
  User,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { palettes, getPaletteStyles, type PaletteId } from "@/lib/themes/palettes";

type TenantShellProps = {
  children: React.ReactNode;
  userName: string;
  role: string;
  initialPaletteId: PaletteId;
};

const navItems = [
  { href: "/monitoramento", label: "Monitoramento", icon: FileSearch },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/clientes", label: "Clientes", icon: UsersRound },
  { href: "/relatorios", label: "Relatorios", icon: BarChart3 },
  { href: "/financeiro", label: "Financeiro", icon: BriefcaseBusiness },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "MJ";
}

export function TenantShell({ children, userName, role, initialPaletteId }: TenantShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantParam = searchParams.get("tenant");
  const currentScope = searchParams.get("scope") ?? "all";
  const [paletteId, setPaletteId] = useState<PaletteId>(initialPaletteId);

  const isStaff = role === "staff";

  useEffect(() => {
    const stored = window.localStorage.getItem("meujudi-palette") as PaletteId | null;
    if (stored && stored !== initialPaletteId) {
      setPaletteId(stored);
    }
  }, [initialPaletteId]);

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const detail = (event as CustomEvent<{ palette?: PaletteId }>).detail;
      if (detail?.palette) setPaletteId(detail.palette);
    }

    window.addEventListener("meujudi-theme-change", handleThemeChange);
    return () => window.removeEventListener("meujudi-theme-change", handleThemeChange);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("meujudi-palette", paletteId);
    document.cookie = `meujudi-palette=${paletteId};path=/;max-age=31536000;SameSite=Lax`;
  }, [paletteId]);

  const paletteStyles = useMemo(() => {
    const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];
    return getPaletteStyles(palette);
  }, [paletteId]);

  function withTenantContext(href: string) {
    if (!tenantParam) return href;
    const separator = href.includes("?") ? "&" : "?";
    return `${href}${separator}tenant=${encodeURIComponent(tenantParam)}`;
  }

  function withScope(href: string, scope: string) {
    let url = href;
    if (tenantParam) {
      url += `?tenant=${encodeURIComponent(tenantParam)}&scope=${scope}`;
    } else {
      url += `?scope=${scope}`;
    }
    return url;
  }

  function handleScopeChange(scope: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("scope", scope);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="tenant-shell min-h-screen" data-theme="custom" style={paletteStyles}>
      <div className="grid min-h-screen lg:grid-cols-[230px_1fr]">
        <aside className="sticky top-0 z-20 flex h-auto gap-2 overflow-x-auto bg-[var(--tenant-sidebar)] px-3 py-3 text-[var(--tenant-sidebar-foreground)] lg:h-screen lg:flex-col lg:overflow-visible lg:px-3 lg:py-5">
          <Link href={withTenantContext("/monitoramento")} className="flex shrink-0 items-center pb-5 pr-4 lg:pb-5">
            <span className="block w-40 lg:w-full">
              <MeuJudiLogo className={cn("block h-auto w-full", paletteId === "padrao" && "logo-outline-white")} />
            </span>
          </Link>

          <nav className="flex gap-1 lg:mt-3 lg:flex-col">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={withTenantContext(item.href)}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[var(--tenant-sidebar-foreground)] transition-colors hover:bg-[var(--tenant-surface-muted)] hover:text-[var(--tenant-brass)]",
                    active && "bg-[var(--tenant-surface-muted)] text-[var(--tenant-brass)]",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="hidden whitespace-nowrap sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hidden flex-1 lg:block" />

          <div className="border-[var(--tenant-line)] lg:border-t lg:pt-2">
            <Link
              href={withTenantContext("/configuracoes")}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[var(--tenant-sidebar-foreground)] transition-colors hover:bg-[var(--tenant-surface-muted)] hover:text-[var(--tenant-brass)]",
                pathname.startsWith("/configuracoes") && "bg-[var(--tenant-surface-muted)] text-[var(--tenant-brass)]",
              )}
            >
              <Settings className="h-[18px] w-[18px]" />
              <span className="hidden whitespace-nowrap sm:inline">Configuracoes</span>
            </Link>
          </div>
        </aside>

        <main className="min-w-0 bg-[var(--tenant-paper)] px-4 py-5 text-[var(--color-foreground)] sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              <Search className="h-4 w-4" />
              <span>Buscar processo, cliente ou tarefa...</span>
            </div>
            <div className="flex items-center gap-3">
              {!isStaff && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                        currentScope === "mine"
                          ? "border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_10%,transparent)] text-[var(--tenant-brass)]"
                          : "border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-muted-foreground)] hover:bg-[var(--tenant-surface-muted)]",
                      )}
                    >
                      {currentScope === "mine" ? <User className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="hidden sm:inline">{currentScope === "mine" ? "Meus casos" : "Todos"}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-1">
                    <button
                      type="button"
                      onClick={() => handleScopeChange("all")}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--tenant-surface-muted)]",
                        currentScope === "all" && "bg-[var(--tenant-surface-muted)] text-[var(--tenant-brass)]",
                      )}
                    >
                      <Eye className="h-4 w-4" />
                      Todos os casos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScopeChange("mine")}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-[var(--tenant-surface-muted)]",
                        currentScope === "mine" && "bg-[var(--tenant-surface-muted)] text-[var(--tenant-brass)]",
                      )}
                    >
                      <User className="h-4 w-4" />
                      Meus casos
                    </button>
                  </PopoverContent>
                </Popover>
              )}
              <div className="text-right text-sm">
                <strong className="block text-[var(--color-card-foreground)]">{userName}</strong>
                <span className="text-xs text-[var(--color-muted-foreground)]">{role}</span>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--tenant-sidebar)] font-mono text-xs font-bold text-[var(--tenant-brass-light)]">
                {initials(userName)}
              </div>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
