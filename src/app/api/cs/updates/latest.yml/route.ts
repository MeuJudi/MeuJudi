import { NextResponse } from "next/server";

/**
 * GET /api/cs/updates/latest.yml
 *
 * Proxy com cache do `latest.yml` do repo de releases do Sync
 * (MeuJudi/MeuJudi-Sync-Releases). O `electron-updater` do CS aponta pro
 * provider "generic" nesta URL em vez de bater direto no GitHub — assim
 * o CS pode checar com bastante frequência (ver `INTERVALS.updateCheck`
 * em meujudi-cs) sem esbarrar no limite de 60 requisições/hora por IP da
 * API do GitHub sem autenticação: só ESTE endpoint conversa com o GitHub,
 * no máximo 1x a cada `CACHE_SECONDS` — todos os devices do mundo batem
 * aqui, não no GitHub direto.
 *
 * Os arquivos grandes (instalador, blockmap) continuam vindo direto do
 * GitHub via redirect (`[filename]/route.ts`) — só o metadado pequeno
 * (`latest.yml`, checado com frequência) passa pelo cache de verdade.
 *
 * Só UM nível de cache: o `Cache-Control` da resposta, que o CDN da
 * Vercel respeita. Achado 17/08/2026: usar TAMBÉM o `next.revalidate` do
 * `fetch` (Data Cache do Next.js) ao mesmo tempo empilhava dois caches
 * independentes sem sincronia entre si — na prática, ficou mais lento e
 * imprevisível que os 2min pretendidos (passou de 3min e ainda servia
 * dado velho). `cache: 'no-store'` aqui garante que toda vez que a função
 * roda, ela busca fresco do GitHub — quem decide a frequência de verdade
 * é só o Cache-Control abaixo.
 */

const GITHUB_LATEST_YML_URL =
  "https://github.com/MeuJudi/MeuJudi-Sync-Releases/releases/latest/download/latest.yml";
const CACHE_SECONDS = 120;

export async function GET() {
  let response: Response;
  try {
    response = await fetch(GITHUB_LATEST_YML_URL, { cache: "no-store" });
  } catch (error) {
    console.error("[cs/updates/latest.yml] falha ao buscar do GitHub:", error);
    return NextResponse.json({ error: "falha_ao_buscar_latest_yml" }, { status: 502 });
  }

  if (response.status === 404) {
    return NextResponse.json({ error: "latest_yml_nao_encontrado", message: "Nenhum latest.yml encontrado no release mais recente do GitHub. Envie o latest.yml pelo painel admin." }, { status: 404 });
  }

  if (!response.ok) {
    console.error("[cs/updates/latest.yml] GitHub respondeu", response.status);
    return NextResponse.json({ error: "falha_ao_buscar_latest_yml" }, { status: 502 });
  }

  const text = await response.text();
  return new NextResponse(text, {
    status: 200,
    headers: {
      "Content-Type": "text/yaml; charset=utf-8",
      "Cache-Control": `public, max-age=30, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=60`,
    },
  });
}
