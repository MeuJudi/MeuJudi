"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteUser } from "../../actions";

export function DeleteUserButton({ userId, tenantId, userName }: { userId: string; tenantId: string; userName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmation = prompt(`Para excluir o usuário "${userName}", digite EXCLUIR:`);
    if (confirmation !== "EXCLUIR") return;

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("user_id", userId);
      formData.set("tenant_id", tenantId);
      formData.set("confirmation", confirmation);
      const result = await deleteUser(formData);
      if (result?.ok) {
        router.refresh();
      } else {
        setError(result?.message ?? "Erro ao excluir.");
      }
    });
  }

  return (
    <div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        onClick={handleClick}
        disabled={isPending}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
