"use client";

import { Building2, ArrowRight, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";

export function WorkspaceChoice() {
  const router = useRouter();
  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="grid gap-5 p-6 sm:grid-cols-2 sm:p-8">
        <button type="button" onClick={() => router.push("/onboarding?flow=create")} className="group rounded-lg border-2 border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-6 text-left transition-colors hover:border-[var(--tenant-brass)] hover:bg-[var(--tenant-surface-muted)]">
          <Building2 className="h-8 w-8 text-[var(--tenant-brass)]" />
          <h2 className="mt-5 text-lg font-semibold text-[var(--tenant-surface-foreground)]">Criar um escritório</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">Cadastre seu escritório e entre como sócio ou sócia responsável.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--tenant-brass)]">Começar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
        </button>
        <button type="button" onClick={() => router.push("/onboarding?flow=join")} className="group rounded-lg border-2 border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-6 text-left transition-colors hover:border-[var(--tenant-brass)] hover:bg-[var(--tenant-surface-muted)]">
          <UsersRound className="h-8 w-8 text-[var(--tenant-brass)]" />
          <h2 className="mt-5 text-lg font-semibold text-[var(--tenant-surface-foreground)]">Entrar em um escritório</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">Use o convite enviado pelo sócio ou administrador do escritório.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[var(--tenant-brass)]">Verificar convite <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></span>
        </button>
      </CardContent>
    </Card>
  );
}
