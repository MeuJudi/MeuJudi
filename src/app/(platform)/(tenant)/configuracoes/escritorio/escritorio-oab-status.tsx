"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ShieldCheck, ShieldX, ShieldAlert, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type StatusOab = {
  user_id: string;
  oab_number: string;
  oab_uf: string;
  nome_oficial: string | null;
  situacao: string | null;
  tipo_inscricao: string | null;
  ultima_validacao: string;
  valido: boolean;
  user_name?: string | null;
};

function statusTone(situacao?: string | null, valido?: boolean) {
  if (!situacao) return "muted";
  const s = situacao.toUpperCase();
  if (valido || s.includes("ATIV") || s.includes("REGULAR") || s.includes("INSCRITO")) {
    return "ok";
  }
  if (s.includes("SUSPENS") || s.includes("BAIXAD") || s.includes("CANCELAD")) {
    return "bad";
  }
  return "warn";
}

function relTempo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diff / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  if (dias < 30) return `há ${Math.floor(dias / 7)} sem`;
  return `há ${Math.floor(dias / 30)} meses`;
}

export function EscritorioOabStatus() {
  const [items, setItems] = useState<StatusOab[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showLoader = true) {
    if (showLoader) setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("user_oab_status")
      .select("user_id, oab_number, oab_uf, nome_oficial, situacao, tipo_inscricao, ultima_validacao, valido")
      .order("ultima_validacao", { ascending: false });

    if (error) {
      console.error("[OAB status]", error);
      setLoading(false);
      return;
    }

    // Buscar nomes dos usuários
    const userIds = Array.from(new Set((data ?? []).map((d) => d.user_id)));
    if (userIds.length) {
      const { data: users } = await supabase
        .from("users")
        .select("id, name")
        .in("id", userIds);
      const map = new Map<string, string>();
      for (const u of users ?? []) map.set(u.id, u.name);
      setItems(
        (data ?? []).map((d) => ({ ...d, user_name: map.get(d.user_id) ?? null }))
      );
    } else {
      setItems([]);
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    load();
  }, []);

  function handleRefresh() {
    setRefreshing(true);
    load(false);
  }

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--tenant-brass)]" />
            <h3 className="font-semibold">Situação das OABs</h3>
            <Badge variant="outline" className="ml-2 text-xs">
              {items.length} cadastrada{items.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            variant="ghost"
            size="sm"
            className="text-[var(--color-muted-foreground)]"
            title="Atualizar"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
            />
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : items.length === 0 ? (
          <p className="py-2 text-sm text-[var(--color-muted-foreground)]">
            Nenhuma OAB validada ainda. Vá em{" "}
            <a
              href="/configuracoes/oabs"
              className="text-[var(--tenant-brass)] underline"
            >
              OABs
            </a>{" "}
            para validar.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--tenant-line)]">
            {items.map((s) => {
              const tone = statusTone(s.situacao, s.valido);
              return (
                <li
                  key={s.user_id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    {tone === "ok" && (
                      <ShieldCheck className="h-5 w-5 shrink-0 text-green-700" />
                    )}
                    {tone === "warn" && (
                      <ShieldAlert className="h-5 w-5 shrink-0 text-amber-600" />
                    )}
                    {tone === "bad" && (
                      <ShieldX className="h-5 w-5 shrink-0 text-red-700" />
                    )}
                    {tone === "muted" && (
                      <ShieldAlert className="h-5 w-5 shrink-0 text-[var(--color-muted-foreground)]" />
                    )}
                    <div>
                      <p className="font-semibold text-[var(--color-card-foreground)]">
                        {s.nome_oficial ?? s.user_name ?? `Usuário ${s.user_id.slice(0, 6)}`}
                      </p>
                      <p className="text-xs text-[var(--color-muted-foreground)]">
                        OAB {s.oab_number}/{s.oab_uf}
                        {s.tipo_inscricao ? ` · ${s.tipo_inscricao}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        tone === "ok" && "text-green-700",
                        tone === "warn" && "text-amber-700",
                        tone === "bad" && "text-red-700",
                        tone === "muted" && "text-[var(--color-muted-foreground)]"
                      )}
                    >
                      {s.situacao ?? "Não validada"}
                    </p>
                    <p className="text-[10px] text-[var(--color-muted-foreground)]">
                      validado {relTempo(s.ultima_validacao)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
