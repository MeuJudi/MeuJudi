"use server";

import { createSign } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireSuperAdmin } from "@/lib/auth/guards";

export type CsRelease = {
  id: string;
  version: string;
  file_url: string;
  file_name: string;
  file_size_bytes: number | null;
  changelog: string | null;
  uploaded_by: string | null;
  uploaded_at: string;
  is_active: boolean;
  github_release_id: number | null;
  github_asset_id: number | null;
  github_tag_name: string | null;
};

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

type GithubUploadTicket = {
  uploadUrl: string;
  token: string;
  releaseId: number;
  tagName: string;
  fileName: string;
  fileSizeBytes: number;
  version: string;
  changelog: string | null;
};

export async function getActiveCsRelease(): Promise<CsRelease | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cs_releases")
    .select("*")
    .eq("is_active", true)
    .order("uploaded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CsRelease;
}

export async function listCsReleases(): Promise<CsRelease[]> {
  await requireSuperAdmin();
  const { data } = await createServiceClient()
    .from("cs_releases")
    .select("*")
    .order("uploaded_at", { ascending: false });
  return (data ?? []) as CsRelease[];
}

function githubConfig() {
  const appId = process.env.GITHUB_APP_ID;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const owner = process.env.GITHUB_RELEASE_OWNER ?? "MeuJudi";
  const repo = process.env.GITHUB_RELEASE_REPO ?? "MeuJudi";
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

async function getGithubInstallationToken() {
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
        "GitHub App nao encontrado. Confira GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID e se o App foi instalado no repositorio MeuJudi/MeuJudi. Detalhes: " +
          details,
      );
    }
    throw new Error(`GitHub token: ${details}`);
  }
  const body = (await response.json()) as { token: string };
  return { ...config, token: body.token };
}

/** Cria a release e devolve um token temporario para o upload direto do navegador. */
export async function createGithubReleaseUploadTicket(input: {
  version: string;
  fileName: string;
  fileSizeBytes: number;
  changelog: string | null;
}): Promise<ActionResult<GithubUploadTicket>> {
  await requireSuperAdmin();
  try {
    const version = input.version.trim();
    const fileName = input.fileName.trim();
    if (!version) return { ok: false, error: "Versão é obrigatória." };
    if (!fileName || input.fileSizeBytes <= 0) {
      return { ok: false, error: "Nenhum arquivo selecionado." };
    }
    if (input.fileSizeBytes > 2 * 1024 * 1024 * 1024) {
      return { ok: false, error: "O arquivo não pode ultrapassar 2 GiB." };
    }

    const github = await getGithubInstallationToken();
    const extension = fileName.split(".").pop()?.toLowerCase() ?? "exe";
    const assetName = `MeuJudi-CS-Setup-v${version}.${extension}`;
    const tagName = `v${version}`;
    const response = await fetch(
      `https://api.github.com/repos/${github.owner}/${github.repo}/releases`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${github.token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          tag_name: tagName,
          name: `MeuJudi CS ${tagName}`,
          body: input.changelog?.trim() || `Versão ${tagName} do MeuJudi CS.`,
          draft: false,
          prerelease: false,
        }),
      },
    );
    if (!response.ok) throw new Error(`GitHub release: ${await response.text()}`);
    const release = (await response.json()) as { id: number; upload_url: string };
    const uploadUrl = `${release.upload_url.replace("{?name,label}", "")}?name=${encodeURIComponent(assetName)}`;
    return {
      ok: true,
      data: { uploadUrl, token: github.token, releaseId: release.id, tagName, fileName: assetName, fileSizeBytes: input.fileSizeBytes, version, changelog: input.changelog?.trim() || null },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no GitHub.";
    console.error("[CS release] Falha ao criar release:", error);
    return { ok: false, error: message };
  }
}

/** Registra no Supabase um asset que ja foi enviado diretamente ao GitHub. */
export async function finalizeGithubReleaseUpload(input: {
  releaseId: number;
  assetId: number;
  browserDownloadUrl: string;
  tagName: string;
  version: string;
  fileName: string;
  fileSizeBytes: number;
  changelog: string | null;
}): Promise<ActionResult<null>> {
  const ctx = await requireSuperAdmin();
  const { error: deactivateError } = await ctx.supabase
    .from("cs_releases")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError) return { ok: false, error: `Banco: ${deactivateError.message}` };

  const { error } = await ctx.supabase.from("cs_releases").insert({
    version: input.version,
    file_url: input.browserDownloadUrl,
    file_name: input.fileName,
    file_size_bytes: input.fileSizeBytes,
    changelog: input.changelog,
    uploaded_by: ctx.profile.id,
    is_active: true,
    github_release_id: input.releaseId,
    github_asset_id: input.assetId,
    github_tag_name: input.tagName,
  });
  if (error) return { ok: false, error: `Banco: ${error.message}` };

  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
  revalidatePath("/cs");
  return { ok: true, data: null };
}

export async function deactivateCsRelease(releaseId: string) {
  const ctx = await requireSuperAdmin();
  await ctx.supabase.from("cs_releases").update({ is_active: false }).eq("id", releaseId);
  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
}

export async function activateCsRelease(releaseId: string) {
  const ctx = await requireSuperAdmin();
  await ctx.supabase.from("cs_releases").update({ is_active: false }).neq("id", releaseId);
  await ctx.supabase.from("cs_releases").update({ is_active: true }).eq("id", releaseId);
  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
}

export async function deleteCsRelease(releaseId: string) {
  await requireSuperAdmin();
  const service = createServiceClient();
  const { data: release } = await service
    .from("cs_releases")
    .select("file_url, file_name, version, github_release_id")
    .eq("id", releaseId)
    .single();

  if (release?.github_release_id) {
    const github = await getGithubInstallationToken();
    await fetch(`https://api.github.com/repos/${github.owner}/${github.repo}/releases/${release.github_release_id}`, {
      method: "DELETE",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${github.token}`, "X-GitHub-Api-Version": "2022-11-28" },
    });
  } else if (release) {
    // Compatibilidade com versões antigas que ainda foram salvas no Storage.
    const extension = release.file_name.split(".").pop() ?? "exe";
    await service.storage
      .from("cs-releases")
      .remove([`releases/v${release.version}.${extension}`]);
  }
  await service.from("cs_releases").delete().eq("id", releaseId);
  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
}
