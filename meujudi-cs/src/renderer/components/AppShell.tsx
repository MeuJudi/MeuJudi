import Link from 'next/link';
import type { ReactNode } from 'react';

interface AppShellProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Shell compartilhado de todas as telas do MeuJudi Sync (exceto a Home).
 * Centraliza o cabeçalho (voltar + título) pra acabar com a inconsistência
 * de cada página desenhar o próprio header (algumas usavam <a href="../../index.html">
 * cru, outras next/link — ver docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 1).
 */
export function AppShell({ title, subtitle, backHref = '/', actions, children }: AppShellProps) {
  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700">
              ← Voltar
            </Link>
            <h1 className="mt-1 text-3xl font-bold">{title}</h1>
            {subtitle && <p className="mt-1 text-gray-500">{subtitle}</p>}
          </div>
          {actions && <div className="shrink-0">{actions}</div>}
        </header>
        {children}
      </div>
    </main>
  );
}
