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
  Bell,
  LogOut,
  UserCircle,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signOut } from "@/app/(auth)/actions";
import { cn } from "@/lib/utils";
import { palettes, getPaletteStyles, type PaletteId } from "@/lib/themes/palettes";

type TenantShellProps = {
  children: React.ReactNode;
  userName: string;
  role: string;
  avatarUrl: string | null;
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

export function TenantShell({ children, userName, role, avatarUrl, initialPaletteId }: TenantShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantParam = searchParams.get("tenant");
  const currentScope = searchParams.get("scope") ?? "all";
  const [paletteId, setPaletteId] = useState<PaletteId>(() => {
    if (typeof window === "undefined") return initialPaletteId;
    return (window.localStorage.getItem("meujudi-palette") as PaletteId | null) ?? initialPaletteId;
  });
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isStaff = role === "staff";

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

  useEffect(() => {
    function handleClickOutside() {
      setProfileOpen(false);
    }
    if (profileOpen) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [profileOpen]);

  const paletteStyles = useMemo(() => {
    const palette = palettes.find((p) => p.id === paletteId) ?? palettes[0];
    return getPaletteStyles(palette);
  }, [paletteId]);

  useEffect(() => {
    const root = document.documentElement;
    for (const [property, value] of Object.entries(paletteStyles)) {
      root.style.setProperty(property, String(value));
    }

    return () => {
      for (const property of Object.keys(paletteStyles)) {
        root.style.removeProperty(property);
      }
    };
  }, [paletteStyles]);

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

        <main className="min-w-0 bg-[var(--tenant-paper)] px-4 py-5 text-gray-900 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-white px-3 py-2 text-sm text-gray-500">
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
                          : "border-[var(--tenant-line)] bg-white text-gray-700 hover:bg-gray-50",
                      )}
                    >
                      {currentScope === "mine" ? <User className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="hidden sm:inline">{currentScope === "mine" ? "Meus casos" : "Todos"}</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 border-[var(--tenant-line)] bg-white !p-1" style={{ color: "#111827" }}>
                    <button
                      type="button"
                      onClick={() => handleScopeChange("all")}
                      style={{ color: currentScope === "all" ? undefined : "#111827" }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-gray-50",
                        currentScope === "all" && "bg-gray-50 !text-[var(--tenant-brass)]",
                      )}
                    >
                      <Eye className="h-4 w-4" />
                      Todos os casos
                    </button>
                    <button
                      type="button"
                      onClick={() => handleScopeChange("mine")}
                      style={{ color: currentScope === "mine" ? undefined : "#111827" }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-left transition-colors hover:bg-gray-50",
                        currentScope === "mine" && "bg-gray-50 !text-[var(--tenant-brass)]",
                      )}
                    >
                      <User className="h-4 w-4" />
                      Meus casos
                    </button>
                  </PopoverContent>
                </Popover>
              )}
              <div
                className="relative"
                onMouseEnter={() => setNotifOpen(true)}
                onMouseLeave={() => setNotifOpen(false)}
              >
                <button
                  type="button"
                  className="relative flex h-9 w-9 items-center justify-center rounded-md border border-[var(--tenant-line)] bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-[var(--tenant-brass)]"
                >
                  <Bell className="h-4 w-4" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--tenant-brass)] text-[8px] font-bold text-white">
                    3
                  </span>
                </button>
                {notifOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-md border border-[var(--tenant-line)] bg-white shadow-lg">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">
                        Notificações
                      </p>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                          <CheckSquare className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900">
                            Prazo de <strong>Recurso INSS</strong> amanhã
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            Processo 0001234-56.2024.8.16.0001
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            há 2 horas
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <UsersRound className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900">
                            Novo cliente <strong>Maria Santos</strong> cadastrado
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            por João Silva
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            há 5 horas
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-gray-50">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                          <FileSearch className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900">
                            Processo <strong>0009876-54.2024.8.16.0002</strong> movimentado
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            Despacho: Cite o réu
                          </p>
                          <p className="mt-0.5 text-xs text-gray-400">
                            ontem
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-gray-200 px-4 py-2">
                      <button
                        type="button"
                        className="w-full text-center text-xs font-medium text-[var(--tenant-brass)] hover:underline"
                      >
                        Ver todas as notificações
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setProfileOpen(!profileOpen); }}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-gray-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--tenant-sidebar)]">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={userName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="font-mono text-xs font-bold text-[var(--tenant-brass-light)]">{initials(userName)}</span>
                    )}
                  </div>
                  <span className="hidden text-sm font-medium text-gray-900 md:block">{userName}</span>
                </button>
                {profileOpen && (
                  <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full z-50 mt-1 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
                    <div className="border-b border-gray-200 px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{userName}</p>
                      <p className="text-xs text-gray-500">{role}</p>
                    </div>
                    <div className="py-1">
                      <Link
                        href={withTenantContext("/configuracoes/perfil")}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <UserCircle className="h-4 w-4" />
                        Meu Perfil
                      </Link>
                      <Link
                        href={withTenantContext("/configuracoes")}
                        className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                      >
                        <Settings className="h-4 w-4" />
                        Configurações
                      </Link>
                    </div>
                    <div className="border-t border-gray-200 py-1">
                      <form action={signOut}>
                        <button
                          type="submit"
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4" />
                          Sair
                        </button>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {children}
        </main>
      </div>
    </div>
  );
}
