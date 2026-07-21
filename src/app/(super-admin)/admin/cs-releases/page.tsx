import { requireSuperAdmin } from "@/lib/auth/guards";
import { listCsReleases, type CsRelease } from "./actions";
import { CsReleaseForm } from "./cs-release-form";
import { CsReleaseActions } from "./cs-release-actions";
import { Download, Package, CalendarDays, HardDrive } from "lucide-react";

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CsReleasesPage() {
  await requireSuperAdmin();
  const releases = await listCsReleases();
  const active = releases.find((r) => r.is_active);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">
          MeuJudi CS — Versões
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gerencie o instalador do MeuJudi CS disponível para download pelos
          escritórios.
        </p>
      </header>

      {/* Versão ativa atual */}
      {active ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <Download className="h-4 w-4" />
            Versão ativa: v{active.version}
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-green-700">
            <span className="flex items-center gap-1">
              <Package className="h-3.5 w-3.5" />
              {active.file_name}
            </span>
            <span className="flex items-center gap-1">
              <HardDrive className="h-3.5 w-3.5" />
              {formatBytes(active.file_size_bytes)}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" />
              {formatDate(active.uploaded_at)}
            </span>
          </div>
          {active.changelog && (
            <p className="mt-2 text-xs text-green-700">
              <strong>Changelog:</strong> {active.changelog}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-center text-sm text-muted-foreground">
          Nenhuma versão disponível. Faça upload de uma versão abaixo.
        </div>
      )}

      {/* Formulário de upload */}
      <CsReleaseForm />

      {/* Lista de versões */}
      {releases.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Histórico de versões</h2>
          <div className="space-y-2">
            {releases.map((release) => (
              <CsReleaseCard key={release.id} release={release} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CsReleaseCard({ release }: { release: CsRelease }) {
  return (
    <div
      className={`flex items-center justify-between rounded-lg border p-4 ${
        release.is_active
          ? "border-green-200 bg-green-50/50"
          : "border-[var(--tenant-line)] bg-[var(--tenant-surface)]"
      }`}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono font-semibold">v{release.version}</span>
          {release.is_active && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">
              Ativa
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{release.file_name}</span>
          <span>{formatBytes(release.file_size_bytes)}</span>
          <span>{formatDate(release.uploaded_at)}</span>
        </div>
        {release.changelog && (
          <p className="text-xs text-muted-foreground">{release.changelog}</p>
        )}
      </div>
      <CsReleaseActions
        releaseId={release.id}
        isActive={release.is_active}
      />
    </div>
  );
}
