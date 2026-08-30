"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Check, X, Trash2, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  activateCsRelease,
  deactivateCsRelease,
  deleteCsRelease,
  uploadLatestYmlToExistingRelease,
} from "./actions";

type Props = {
  releaseId: string;
  isActive: boolean;
  githubReleaseId: number | null;
};

export function CsReleaseActions({ releaseId, isActive, githubReleaseId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [ymlUploading, setYmlUploading] = useState(false);
  const [ymlResult, setYmlResult] = useState<string | null>(null);
  const ymlRef = useRef<HTMLInputElement>(null);

  if (deleted) return null;

  function handleToggle() {
    startTransition(async () => {
      if (isActive) {
        await deactivateCsRelease(releaseId);
      } else {
        await activateCsRelease(releaseId);
      }
    });
  }

  function handleDelete() {
    if (!confirm("Isso apaga o instalador de verdade no GitHub, não só remove da lista. Essa ação não pode ser desfeita. Tem certeza?")) return;
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteCsRelease(releaseId);
      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }
      setDeleted(true);
    });
  }

  async function handleUploadYml(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setYmlUploading(true);
    setYmlResult(null);
    try {
      const content = await file.text();
      const result = await uploadLatestYmlToExistingRelease({ csReleaseId: releaseId, latestYmlContent: content });
      setYmlResult(result.ok ? "latest.yml enviado!" : result.error);
    } catch {
      setYmlResult("Falha ao ler/enviar arquivo.");
    } finally {
      setYmlUploading(false);
      if (ymlRef.current) ymlRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleToggle}
          disabled={isPending}
          className="h-7 text-xs"
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isActive ? (
            <X className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          {isActive ? "Desativar" : "Usar esta versao"}
        </Button>
        {githubReleaseId && (
          <>
            <input ref={ymlRef} type="file" accept=".yml,.yaml" className="hidden" onChange={handleUploadYml} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => ymlRef.current?.click()}
              disabled={isPending || ymlUploading}
              className="h-7 text-xs"
              title="Enviar latest.yml para o release do GitHub"
            >
              {ymlUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileUp className="h-3 w-3" />}
              YML
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={isPending}
          className="h-7 text-xs text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {deleteError && <p className="max-w-xs text-right text-[11px] text-destructive">{deleteError}</p>}
      {ymlResult && <p className={`max-w-xs text-right text-[11px] ${ymlResult.includes("!") ? "text-green-600" : "text-destructive"}`}>{ymlResult}</p>}
    </div>
  );
}
