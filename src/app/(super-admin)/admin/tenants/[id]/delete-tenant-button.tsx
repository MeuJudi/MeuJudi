"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteTenant } from "../../actions";

export function DeleteTenantButton({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    const confirmation = prompt(`Para excluir o escritório "${tenantName}", digite EXCLUIR:`);
    if (confirmation !== "EXCLUIR") return;

    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("tenant_id", tenantId);
      formData.set("confirmation", confirmation);
      const result = await deleteTenant(formData);
      if (result?.ok) {
        router.push("/admin/tenants");
      } else {
        setError(result?.message ?? "Erro ao excluir.");
      }
    });
  }

  return (
    <div>
      <Button variant="destructive" onClick={handleClick} disabled={isPending}>
        <Trash2 className="h-4 w-4 mr-1" />
        {isPending ? "Excluindo..." : "Excluir Escritório"}
      </Button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
