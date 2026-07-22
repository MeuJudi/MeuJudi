"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOabApiHealth, type HealthStatus } from "./health-check";

export function OabHealthBadge() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getOabApiHealth()
      .then((h) => {
        if (!cancelled) {
          setHealth(h);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        Verificando API...
      </span>
    );
  }

  if (!health) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-600">
        <WifiOff className="h-3 w-3" />
        Status desconhecido
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        health.healthy
          ? "border-green-200 bg-green-50 text-green-700"
          : health.configured
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-amber-200 bg-amber-50 text-amber-700"
      )}
      title={`Latência: ${health.latencyMs}ms · Verificado: ${new Date(health.checkedAt).toLocaleTimeString("pt-BR")}`}
    >
      {health.healthy ? (
        <Wifi className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      {health.healthy ? (
        <>
          API OAB online
          {health.latencyMs > 0 && (
            <span className="text-[10px] opacity-70">
              ({health.latencyMs}ms)
            </span>
          )}
        </>
      ) : (
        health.configured ? "API OAB indisponível" : "Credencial OAB não configurada"
      )}
    </span>
  );
}
