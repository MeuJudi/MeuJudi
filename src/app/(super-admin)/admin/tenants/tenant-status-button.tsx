"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTenantStatus } from "../actions";

function SubmitButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={active ? "destructive" : "default"}
      disabled={pending}
      className={!active ? "bg-emerald-600 text-white hover:bg-emerald-700" : ""}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
      {pending ? (active ? "Suspendendo..." : "Reativando...") : active ? "Suspender tenant" : "Reativar tenant"}
    </Button>
  );
}

export function TenantStatusButton({ tenantId, active, compact = false }: { tenantId: string; active: boolean; compact?: boolean }) {
  const [confirming, setConfirming] = useState(false);

  if (!active) {
    return (
      <form action={setTenantStatus}>
        <input type="hidden" name="tenant_id" value={tenantId} />
        <input type="hidden" name="is_active" value="true" />
        <SubmitButton active={false} />
      </form>
    );
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-red-950 shadow-sm animate-in fade-in slide-in-from-right-2">
        <span className="text-xs font-medium">Suspender este tenant?</span>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100">Cancelar</button>
        <form action={setTenantStatus}>
          <input type="hidden" name="tenant_id" value={tenantId} />
          <input type="hidden" name="is_active" value="false" />
          <SubmitButton active />
        </form>
      </div>
    );
  }

  return (
    <Button type="button" size={compact ? "sm" : "default"} variant="destructive" onClick={() => setConfirming(true)}>
      <Ban className="h-4 w-4" />
      Suspender tenant
    </Button>
  );
}
