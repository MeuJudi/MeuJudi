"use client";

import { useTransition } from "react";
import { removeOab } from "../actions";

export function OabDeleteButton({ oabId }: { oabId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm("Tem certeza que deseja excluir esta OAB do escritório?")) return;
    startTransition(async () => {
      try {
        await removeOab(oabId);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao excluir OAB");
      }
    });
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isPending}
      className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50 font-medium"
    >
      {isPending ? "Excluindo..." : "Excluir"}
    </button>
  );
}
