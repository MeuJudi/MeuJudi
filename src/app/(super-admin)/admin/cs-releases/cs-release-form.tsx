"use client";

import { useState, useTransition, useRef } from "react";
import { Loader2, Upload, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createGithubReleaseUploadTicket,
  finalizeGithubReleaseUpload,
} from "./actions";

export function CsReleaseForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const form = e.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        const file = formData.get("file");
        if (!(file instanceof File) || file.size === 0) {
          throw new Error("Nenhum arquivo selecionado.");
        }

        const ticketResult = await createGithubReleaseUploadTicket({
          version: String(formData.get("version") ?? ""),
          fileName: file.name,
          fileSizeBytes: file.size,
          changelog: String(formData.get("changelog") ?? "") || null,
        });
        if (!ticketResult.ok) throw new Error(ticketResult.error);
        const ticket = ticketResult.data;

        const uploadResponse = await fetch(ticket.uploadUrl, {
          method: "POST",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${ticket.token}`,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error(`GitHub upload: ${await uploadResponse.text()}`);
        }
        const asset = (await uploadResponse.json()) as {
          id: number;
          browser_download_url: string;
        };

        const finalizeResult = await finalizeGithubReleaseUpload({
          ...ticket,
          assetId: asset.id,
          browserDownloadUrl: asset.browser_download_url,
        });
        if (!finalizeResult.ok) throw new Error(finalizeResult.error);
        setSuccess(true);
        form.reset();
        setFileName(null);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao fazer upload.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4"
    >
      <h3 className="text-sm font-semibold">Upload nova versão</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label
            htmlFor="version"
            className="text-xs font-medium text-muted-foreground"
          >
            Versão *
          </label>
          <input
            id="version"
            name="version"
            type="text"
            required
            placeholder="1.0.0"
            pattern="[0-9]+\.[0-9]+[0-9a-zA-Z.\-]*"
            className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Arquivo *
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm hover:bg-[var(--tenant-surface)]"
          >
            <FileUp className="h-4 w-4 text-muted-foreground" />
            {fileName ?? "Selecionar arquivo..."}
          </div>
          <input
            ref={fileRef}
            name="file"
            type="file"
            required
            accept=".exe,.msi,.dmg,.appimage,.tar.gz,.zip"
            className="hidden"
            onChange={(e) =>
              setFileName(e.target.files?.[0]?.name ?? null)
            }
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="changelog"
          className="text-xs font-medium text-muted-foreground"
        >
          Changelog (opcional)
        </label>
        <textarea
          id="changelog"
          name="changelog"
          rows={2}
          placeholder="Correções e melhorias desta versão..."
          className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && (
        <p className="text-xs text-green-600">Versão publicada com sucesso!</p>
      )}

      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Upload className="mr-1.5 h-3.5 w-3.5" />
        )}
        Publicar versão
      </Button>
    </form>
  );
}
