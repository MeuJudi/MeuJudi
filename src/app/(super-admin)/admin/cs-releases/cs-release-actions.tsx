"use client";

import { useState, useTransition } from "react";
import { Loader2, Check, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  activateCsRelease,
  deactivateCsRelease,
  deleteCsRelease,
} from "./actions";

type Props = {
  releaseId: string;
  isActive: boolean;
};

export function CsReleaseActions({ releaseId, isActive }: Props) {
  const [isPending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
    // Apaga o Release DE VERDADE no GitHub (instalador incluído), não só
    // esconde da lista — por isso o aviso explícito aqui.
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
    </div>
  );
}
