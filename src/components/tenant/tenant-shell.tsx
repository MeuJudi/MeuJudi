"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CalendarDays,
  CheckSquare,
  FileSearch,
  Search,
  Settings,
  UsersRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TenantShellProps = {
  children: React.ReactNode;
  userName: string;
  role: string;
};

type ThemeMode = "default" | "light" | "dark" | "custom";

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;
  const parsed = Number.parseInt(value, 16);
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function mix(hex: string, target: string, amount: number) {
  const base = hexToRgb(hex);
  const end = hexToRgb(target);
  return rgbToHex(
    base.r + (end.r - base.r) * amount,
    base.g + (end.g - base.g) * amount,
    base.b + (end.b - base.b) * amount,
  );
}

function applyCustomTheme(color: string) {
  const dark = mix(color, "#000000", 0.72);
  const darker = mix(color, "#000000", 0.82);
  const light = mix(color, "#ffffff", 0.9);
  const lightSurface = mix(color, "#ffffff", 0.96);
  const accent = mix(color, "#000000", 0.38);
  const border = mix(color, "#000000", 0.18);

  return {
    "--tenant-sidebar": dark,
    "--tenant-paper": light,
    "--tenant-line": border,
    "--color-background": light,
    "--color-foreground": darker,
    "--color-card": lightSurface,
    "--color-card-foreground": darker,
    "--color-primary": accent,
    "--color-primary-foreground": "#ffffff",
    "--color-ring": accent,
    "--tenant-brass": accent,
    "--tenant-brass-light": mix(color, "#ffffff", 0.5),
    "--tenant-sidebar-foreground": "#ffffff",
    "--tenant-sidebar-muted": mix(color, "#ffffff", 0.78),
    "--tenant-sidebar-active": "#ffffff",
    "--color-secondary": mix(color, "#ffffff", 0.82),
    "--color-secondary-foreground": darker,
    "--color-muted": mix(color, "#ffffff", 0.82),
    "--color-muted-foreground": mix(color, "#000000", 0.68),
    "--color-accent": mix(color, "#ffffff", 0.78),
    "--color-accent-foreground": darker,
    "--color-border": border,
    "--color-input": border,
  } as React.CSSProperties;
}

export function TenantShell({ children, userName, role }: TenantShellProps) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "default";
    return (window.localStorage.getItem("meujudi-theme") as ThemeMode | null) ?? "default";
  });
  const [customColor, setCustomColor] = useState(() => {
    if (typeof window === "undefined") return "#d9468f";
    return window.localStorage.getItem("meujudi-custom-color") ?? "#d9468f";
  });

  useEffect(() => {
    function handleThemeChange(event: Event) {
      const detail = (event as CustomEvent<{ theme?: ThemeMode; color?: string }>).detail;
      if (detail?.theme) setTheme(detail.theme);
      if (detail?.color) setCustomColor(detail.color);
    }

    window.addEventListener("meujudi-theme-change", handleThemeChange);
    return () => window.removeEventListener("meujudi-theme-change", handleThemeChange);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("meujudi-theme", theme);
    window.localStorage.setItem("meujudi-custom-color", customColor);
  }, [theme, customColor]);

  const customStyle = useMemo(
    () => (theme === "custom" ? applyCustomTheme(customColor) : undefined),
    [customColor, theme],
  );

  return (
    <div className="tenant-shell min-h-screen" data-theme={theme} style={customStyle}>
      <div className="grid min-h-screen lg:grid-cols-[230px_1fr]">
        <aside className="sticky top-0 z-20 flex h-auto gap-2 overflow-x-auto bg-[var(--tenant-sidebar)] px-3 py-3 text-[var(--tenant-sidebar-foreground)] lg:h-screen lg:flex-col lg:overflow-visible lg:px-3 lg:py-5">
          <Link href="/monitoramento" className="flex shrink-0 items-center border-r border-white/10 pr-4 lg:border-b lg:border-r-0 lg:pb-5">
            <span className="block w-40 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10 lg:w-full">
              <Image
                src="/meujudi-logo-2.png"
                alt="MeuJudi"
                width={1774}
                height={887}
                priority
                className="block h-auto w-full"
              />
            </span>
          </Link>

          <nav className="flex gap-1 lg:mt-3 lg:flex-col">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[var(--tenant-sidebar-muted)] transition-colors hover:bg-white/10 hover:text-[var(--tenant-sidebar-active)]",
                    active && "bg-[color-mix(in_srgb,var(--tenant-brass)_22%,transparent)] text-[var(--tenant-sidebar-active)] shadow-[inset_3px_0_0_var(--tenant-brass)]",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  <span className="hidden whitespace-nowrap sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="hidden flex-1 lg:block" />

          <div className="border-white/10 lg:border-t lg:pt-2">
            <Link
              href="/configuracoes"
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-[var(--tenant-sidebar-muted)] transition-colors hover:bg-white/10 hover:text-[var(--tenant-sidebar-active)]",
                pathname.startsWith("/configuracoes") && "bg-[color-mix(in_srgb,var(--tenant-brass)_22%,transparent)] text-[var(--tenant-sidebar-active)] shadow-[inset_3px_0_0_var(--tenant-brass)]",
              )}
            >
              <Settings className="h-[18px] w-[18px]" />
              <span className="hidden whitespace-nowrap sm:inline">Configuracoes</span>
            </Link>
          </div>
        </aside>

        <main className="min-w-0 bg-[var(--tenant-paper)] px-4 py-5 text-[var(--color-foreground)] sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              <Search className="h-4 w-4 opacity-70" />
              <span>Buscar processo, cliente ou tarefa...</span>
            </div>
            <div className="flex items-center gap-3">
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

export { type ThemeMode };
