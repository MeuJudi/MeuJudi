import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/cs/updates/:filename
 *
 * Redireciona pro asset real no GitHub (instalador .exe, .blockmap) — ver
 * `../latest.yml/route.ts` pra explicação do porquê desse proxy existe.
 * Só o `latest.yml` (pequeno, checado com frequência) passa por cache de
 * verdade; os arquivos grandes (raramente baixados — só quando existe
 * atualização de verdade) são só um redirect, sem gastar banda/tempo de
 * função nossa nem contar pro rate-limit da API do GitHub (download de
 * asset via `releases/latest/download/...` não é uma chamada de API).
 */

const GITHUB_RELEASE_BASE = "https://github.com/MeuJudi/MeuJudi-Sync-Releases/releases/latest/download";
// Só nomes de arquivo esperados (instalador/blockmap/yml) — evita virar
// um redirecionador aberto pra qualquer path arbitrário do GitHub.
const FILENAME_PATTERN = /^[\w.-]+\.(exe|blockmap|yml)$/i;

export async function GET(_request: NextRequest, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!FILENAME_PATTERN.test(filename)) {
    return NextResponse.json({ error: "arquivo_invalido" }, { status: 400 });
  }
  return NextResponse.redirect(`${GITHUB_RELEASE_BASE}/${filename}`, 302);
}
