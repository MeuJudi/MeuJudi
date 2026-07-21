"use client";

import { Download, MonitorCheck, FileDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CsRelease } from "@/app/(super-admin)/admin/cs-releases/actions";

type Props = {
  release: CsRelease | null;
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `(${(bytes / 1024).toFixed(0)} KB)`;
  return `(${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
}

export function CsDownloadSection({ release }: Props) {
  return (
    <section className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-[var(--tenant-surface-foreground)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-[var(--tenant-brass)]" />
            <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
              Download do MeuJudi CS
            </h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
            O MeuJudi CS é um aplicativo de desktop que conecta o PJe pelo
            certificado A1 do escritório e sincroniza dados automaticamente com
            a plataforma web.
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4">
        {release ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <MonitorCheck className="h-4 w-4 text-green-600" />
              <span className="font-semibold text-[var(--color-card-foreground)]">
                Versão disponível: v{release.version}
              </span>
              {release.file_size_bytes && (
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  {formatBytes(release.file_size_bytes)}
                </span>
              )}
            </div>

            {release.changelog && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {release.changelog}
              </p>
            )}

            <div className="flex items-center gap-3">
              <Button
                asChild
                size="sm"
                className="bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
              >
                <a href={release.file_url} download>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  Baixar MeuJudi CS
                </a>
              </Button>
              <span className="text-[10px] text-[var(--color-muted-foreground)]">
                Publicado em{" "}
                {new Date(release.uploaded_at).toLocaleDateString("pt-BR")}
              </span>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-[var(--tenant-surface)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Após instalar, volte aqui e gere um código de pareamento para
                conectar o aplicativo ao seu escritório.
              </span>
            </div>
          </div>
        ) : (
          <div className="text-center text-sm text-[var(--color-muted-foreground)]">
            <MonitorCheck className="mx-auto mb-2 h-8 w-8 opacity-30" />
            <p className="font-medium">Nenhuma versão disponível</p>
            <p className="mt-1 text-xs">
              O administrador ainda não publicou uma versão para download. Volte
              em breve.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
