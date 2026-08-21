"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncActiveCsReleaseWithGithubLatest } from "./actions";

type Props = {
  activeVersion: string | null;
  latestGithubVersion: string;
};

/**
 * Aviso quando a versão liberada pros tenants (`cs_releases.is_active`)
 * está atrás do "latest" de verdade do GitHub. O cron
 * (`/api/cron/sync-cs-release`) já corrige isso sozinho a cada ciclo, mas
 * esse botão resolve na hora, sem esperar — e deixa o problema visível em
 * vez de silencioso (era assim que ficou destravado por 12 dias em
 * 19/08/2026).
 */
export function GithubSyncBanner({ activeVersion, latestGithubVersion }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);

  if (synced) return null;

  function handleSync() {
    setError(null);
    startTransition(async () => {
      const result = await syncActiveCsReleaseWithGithubLatest();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSynced(true);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-2 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">
            Versão liberada pra download ({activeVersion ? `v${activeVersion}` : "nenhuma"}) está atrás do GitHub (v{latestGithubVersion}).
          </p>
          <p className="mt-1 text-xs text-amber-700">
            Escritórios novos baixando o Sync agora receberiam a versão desatualizada. O cron automático corrige isso em breve, mas dá pra resolver na hora.
          </p>
          {error && <p className="mt-1 text-xs font-medium text-destructive">{error}</p>}
        </div>
      </div>
      <Button type="button" size="sm" onClick={handleSync} disabled={isPending} className="shrink-0">
        {isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
        Sincronizar agora
      </Button>
    </div>
  );
}
