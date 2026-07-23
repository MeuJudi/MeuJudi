"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createGithubReleaseUploadTicket,
  finalizeGithubReleaseUpload,
  listTrackedCsInstallers,
  publishTrackedCsInstaller,
  type TrackedCsInstaller,
} from "./actions";

export function CsReleaseForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<"local" | "git">("local");
  const [trackedInstallers, setTrackedInstallers] = useState<TrackedCsInstaller[]>([]);
  const [selectedTracked, setSelectedTracked] = useState<TrackedCsInstaller | null>(null);
  const [trackedError, setTrackedError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const versionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (source !== "git" || trackedInstallers.length > 0) return;
    let cancelled = false;
    void listTrackedCsInstallers().then((result) => {
      if (cancelled) return;
      if (result.ok) setTrackedInstallers(result.data);
      else setTrackedError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [source, trackedInstallers.length]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        let file = formData.get("file");
        if (source === "git") {
          if (!selectedTracked) throw new Error("Selecione um instalador versionado no Git.");
          const publishResult = await publishTrackedCsInstaller({
            version: String(formData.get("version") ?? ""),
            fileName: selectedTracked.name,
            fileSizeBytes: selectedTracked.size,
            downloadUrl: selectedTracked.downloadUrl,
            changelog: String(formData.get("changelog") ?? "") || null,
          });
          if (!publishResult.ok) throw new Error(publishResult.error);
          setSuccess(true);
          form.reset();
          setSelectedTracked(null);
          setTimeout(() => setSuccess(false), 3000);
          return;
        }
        if (!(file instanceof File) || file.size === 0) throw new Error("Nenhum arquivo selecionado.");

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
        if (!uploadResponse.ok) throw new Error(`GitHub upload: ${await uploadResponse.text()}`);
        const asset = (await uploadResponse.json()) as { id: number; browser_download_url: string };

        const finalizeResult = await finalizeGithubReleaseUpload({
          ...ticket,
          assetId: asset.id,
          browserDownloadUrl: asset.browser_download_url,
        });
        if (!finalizeResult.ok) throw new Error(finalizeResult.error);
        setSuccess(true);
        form.reset();
        setFileName(null);
        setSelectedTracked(null);
        setTimeout(() => setSuccess(false), 3000);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Erro ao publicar a versao.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-4">
      <h3 className="text-sm font-semibold">Publicar nova versao</h3>

      <div className="grid gap-2 sm:grid-cols-2">
        {(["local", "git"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSource(option)}
            className={`rounded-md border px-3 py-2 text-left text-xs ${source === option ? "border-primary bg-primary/10" : "border-[var(--tenant-line)]"}`}
          >
            <strong className="block">{option === "local" ? "Arquivo deste computador" : "Arquivo versionado no Git"}</strong>
            <span className="text-muted-foreground">{option === "local" ? "Enviar um novo instalador." : "Publicar uma versao ja commitada."}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="version" className="text-xs font-medium text-muted-foreground">Versao *</label>
          <input ref={versionRef} id="version" name="version" type="text" required placeholder="0.1.9" pattern="[0-9]+\.[0-9]+[0-9a-zA-Z.\-]*" className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Arquivo *</label>
          {source === "local" ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="flex w-full items-center gap-2 rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-left text-sm hover:bg-[var(--tenant-surface)]">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              {fileName ?? "Selecionar arquivo..."}
            </button>
          ) : (
            <select
              value={selectedTracked?.name ?? ""}
              onChange={(event) => {
                const selected = trackedInstallers.find((item) => item.name === event.target.value) ?? null;
                setSelectedTracked(selected);
                const version = selected?.name.match(/Setup-v(.+)\.exe$/i)?.[1];
                if (versionRef.current && version) versionRef.current.value = version;
              }}
              className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm"
            >
              <option value="">Selecionar arquivo do Git...</option>
              {trackedInstallers.map((installer) => <option key={installer.name} value={installer.name}>{installer.name}</option>)}
            </select>
          )}
          {trackedError && <p className="text-xs text-destructive">{trackedError}</p>}
          <input ref={fileRef} name="file" type="file" required={source === "local"} accept=".exe,.msi,.dmg,.appimage,.tar.gz,.zip" className="hidden" onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="changelog" className="text-xs font-medium text-muted-foreground">Changelog (opcional)</label>
        <textarea id="changelog" name="changelog" rows={2} placeholder="Correcoes e melhorias desta versao..." className="w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm" />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
      {success && <p className="text-xs text-green-600">Versao publicada com sucesso!</p>}
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
        {source === "git" ? "Liberar versao para download" : "Publicar nova release"}
      </Button>
    </form>
  );
}
