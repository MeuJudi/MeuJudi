// Cron: mantém `cs_releases.is_active` sincronizado com o "latest" de
// verdade do GitHub (MeuJudi/MeuJudi-Sync-Releases). Antes disso, a versão
// liberada pro tenant baixar pela primeira vez (/configuracoes/meujudi-cs)
// só mudava se um Super Admin lembrasse de entrar em /admin/cs-releases e
// clicar em "Liberar versão" manualmente — achado 19/08/2026: a tabela
// ficou 12 dias travada numa versão 5 releases atrasada, sem ninguém
// perceber. Rodar a cada 15-30min (cron-job.org) fecha essa lacuna sem
// depender de ninguém lembrar.

import { NextRequest, NextResponse } from "next/server";
import { fetchLatestGithubSetupRelease, upsertActiveCsRelease } from "@/lib/cs/github-releases";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const latest = await fetchLatestGithubSetupRelease();
    if (!latest) return NextResponse.json({ synced: false, reason: "sem_release_com_instalador" });

    const { changed } = await upsertActiveCsRelease(latest);
    return NextResponse.json({ synced: changed, version: latest.version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida.";
    console.error("[cron/sync-cs-release] falha:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
