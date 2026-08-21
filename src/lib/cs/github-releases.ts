import { createSign } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Lógica de integração com o GitHub Releases do MeuJudi Sync
 * (MeuJudi/MeuJudi-Sync-Releases), compartilhada entre as ações manuais do
 * Super Admin (`admin/cs-releases/actions.ts`) e o cron de sincronização
 * automática (`api/cron/sync-cs-release`). Extraído pra cá porque o cron
 * não tem sessão de usuário — não pode chamar `requireSuperAdmin()`.
 */

export type GithubSetupAsset = {
  releaseId: number;
  assetId: number;
  tagName: string;
  version: string;
  fileName: string;
  fileSizeBytes: number;
  downloadUrl: string;
  changelog: string | null;
};

function githubConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const owner = process.env.GITHUB_RELEASE_OWNER ?? "MeuJudi";
  const repo = process.env.GITHUB_RELEASE_REPO ?? "MeuJudi-Sync-Releases";
  if (!appId || !installationId || !privateKey) {
    throw new Error(
      "GitHub Releases não configurado. Cadastre GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID e GITHUB_APP_PRIVATE_KEY na Vercel.",
    );
  }
  return { appId, installationId, privateKey, owner, repo };
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export async function getGithubInstallationToken() {
  const config = githubConfig();
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.appId }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  const jwt = `${header}.${payload}.${signer.sign(config.privateKey).toString("base64url")}`;
  const response = await fetch(
    `https://api.github.com/app/installations/${config.installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    const details = await response.text();
    if (response.status === 404) {
      throw new Error(
        `GitHub App nao encontrado. Confira GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID e se o App foi instalado no repositorio ${config.owner}/${config.repo}. Detalhes: ${details}`,
      );
    }
    throw new Error(`GitHub token: ${details}`);
  }
  const body = (await response.json()) as { token: string };
  return { ...config, token: body.token };
}

const SETUP_ASSET_PATTERN = /^MeuJudi-(CS|Sync)-Setup-v.+\.exe$/i;

/**
 * Busca o Release que o GitHub considera "latest" de verdade (o mais
 * recente publicado, não-draft, não-prerelease — o mesmo que
 * `releases/latest/download/...` resolve, e o mesmo que o proxy de
 * auto-update do CS usa). Diferente de `listGithubReleases` (que lista
 * até 30 releases pro Super Admin escolher manualmente), essa função
 * responde "qual é o atual" sem ambiguidade nenhuma.
 */
export async function fetchLatestGithubSetupRelease(): Promise<GithubSetupAsset | null> {
  const github = await getGithubInstallationToken();
  const response = await fetch(
    `https://api.github.com/repos/${github.owner}/${github.repo}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${github.token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (response.status === 404) return null; // repo sem nenhum release publicado ainda
  if (!response.ok) throw new Error(`GitHub releases/latest: ${await response.text()}`);

  const release = (await response.json()) as {
    id: number;
    tag_name: string;
    body: string | null;
    assets: Array<{ id: number; name: string; size: number; browser_download_url: string }>;
  };
  const asset = release.assets.find((a) => SETUP_ASSET_PATTERN.test(a.name));
  if (!asset) return null; // release existe mas ainda nao tem o instalador assistido (build parcial)

  return {
    releaseId: release.id,
    assetId: asset.id,
    tagName: release.tag_name,
    version: release.tag_name.replace(/^v/, ""),
    fileName: asset.name,
    fileSizeBytes: asset.size,
    downloadUrl: asset.browser_download_url,
    changelog: release.body?.trim() || null,
  };
}

/**
 * Ativa `release` em `cs_releases` (desativando qualquer outra), criando a
 * linha se a versão ainda não existir. Idempotente: chamar de novo com a
 * mesma versão já ativa não faz nada de errado. Usa o service client
 * (sem sessão de usuário) — é o único jeito de rodar isso a partir do
 * cron, que não tem Super Admin logado.
 */
export async function upsertActiveCsRelease(release: GithubSetupAsset): Promise<{ changed: boolean }> {
  const supabase = createServiceClient();

  const { data: existing } = await supabase
    .from("cs_releases")
    .select("id, is_active")
    .eq("version", release.version)
    .maybeSingle();

  if (existing?.is_active) return { changed: false }; // já é a versão ativa, nada a fazer

  await supabase.from("cs_releases").update({ is_active: false }).eq("is_active", true);

  if (existing) {
    await supabase.from("cs_releases").update({ is_active: true }).eq("id", existing.id);
  } else {
    await supabase.from("cs_releases").insert({
      version: release.version,
      file_url: release.downloadUrl,
      file_name: release.fileName,
      file_size_bytes: release.fileSizeBytes,
      changelog: release.changelog,
      uploaded_by: null,
      is_active: true,
      github_release_id: release.releaseId,
      github_asset_id: release.assetId,
      github_tag_name: release.tagName,
    });
  }
  return { changed: true };
}
