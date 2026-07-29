"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type CsStatusResponse = { online?: boolean; devices?: Array<{ online?: boolean }> };

export function CsStatusBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const response = await fetch("/api/cs/status", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as CsStatusResponse;
        if (active) setShow(Boolean(data.devices?.length) && data.online === false);
      } catch {
        // O banner não deve bloquear a navegação se o endpoint estiver indisponível.
      }
    }
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (!show) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p><strong>MeuJudi Sync está offline.</strong> As consultas do Mural aguardando este escritório ficarão pendentes.</p>
      <Link href="/configuracoes/meujudi-cs" className="font-semibold underline underline-offset-2">Ver conexão</Link>
    </div>
  );
}
