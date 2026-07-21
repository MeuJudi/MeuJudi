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
    if (!confirm("Tem certeza que deseja excluir esta versão?")) return;
    startTransition(async () => {
      await deleteCsRelease(releaseId);
      setDeleted(true);
    });
  }

  return (
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
        {isActive ? "Desativar" : "Ativar"}
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
  );
}
