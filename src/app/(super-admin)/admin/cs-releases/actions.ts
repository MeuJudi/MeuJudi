"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  getGithubInstallationToken,
  fetchLatestGithubSetupRelease,
  upsertActiveCsRelease,
  type GithubSetupAsset,
} from "@/lib/cs/github-releases";

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

export type TrackedGithubRelease = {
  releaseId: number;
  assetId: number;
  tagName: string;
  version: string;
  fileName: string;
  fileSizeBytes: number;
  downloadUrl: string;
};

/** Lista Releases já publicados no GitHub (ex.: via `gh release upload` direto), pra Super Admin adotar sem re-enviar o arquivo. */
export async function listGithubReleases(): Promise<ActionResult<TrackedGithubRelease[]>> {
  await requireSuperAdmin();
  try {
    const github = await getGithubInstallationToken();
    const response = await fetch(
      `https://api.github.com/repos/${github.owner}/${github.repo}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${github.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      const details = await response.text();
      if (response.status === 403) {
        throw new Error(
          `O GitHub App nao tem permissao pra listar releases em ${github.owner}/${github.repo}. Detalhes: ${details}`,
        );
      }
      throw new Error(`GitHub releases: ${details}`);
    }
    const releases = (await response.json()) as Array<{
      id: number;
      tag_name: string;
      assets: Array<{ id: number; name: string; size: number; browser_download_url: string }>;
    }>;
    const data: TrackedGithubRelease[] = [];
    for (const release of releases) {
      const asset = release.assets.find((a) => /^MeuJudi-(CS|Sync)-Setup-v.+\.exe$/i.test(a.name));
      if (!asset) continue;
      const version = release.tag_name.replace(/^v/, "");
      data.push({
        releaseId: release.id,
        assetId: asset.id,
        tagName: release.tag_name,
        version,
        fileName: asset.name,
        fileSizeBytes: asset.size,
        downloadUrl: asset.browser_download_url,
      });
    }
    return { ok: true, data };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao listar releases do GitHub.";
    return { ok: false, error: message };
  }
}

/** Registra no cs_releases um Release que já existe no GitHub (sem fazer upload). */
export async function adoptGithubRelease(input: {
  releaseId: number;
  assetId: number;
  tagName: string;
  version: string;
  fileName: string;
  fileSizeBytes: number;
  downloadUrl: string;
  changelog: string | null;
}): Promise<ActionResult<null>> {
  const ctx = await requireSuperAdmin();
  if (await versionAlreadyRegistered(input.version)) {
    return { ok: false, error: `A versao ${input.version} ja esta salva. Use a versao existente.` };
  }
  const { error: deactivateError } = await ctx.supabase
    .from("cs_releases")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError) return { ok: false, error: `Banco: ${deactivateError.message}` };

  const { error } = await ctx.supabase.from("cs_releases").insert({
    version: input.version,
    file_url: input.downloadUrl,
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

async function versionAlreadyRegistered(version: string) {
  const { data } = await createServiceClient()
    .from("cs_releases")
    .select("id")
    .eq("version", version)
    .limit(1)
    .maybeSingle();
  return Boolean(data);
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
    const assetName = `MeuJudi-Sync-Setup-v${version}.${extension}`;
    const tagName = `v${version}`;
    if (await versionAlreadyRegistered(version)) {
      return { ok: false, error: `A versao ${version} ja esta salva. O sistema deve usar a proxima versao disponivel.` };
    }
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
          name: `MeuJudi Sync ${tagName}`,
          body: input.changelog?.trim() || `Versão ${tagName} do MeuJudi Sync.`,
          draft: false,
          prerelease: false,
        }),
      },
    );
    let release: { id: number; upload_url: string; assets?: Array<{ id: number; name: string }> };
    if (response.ok) {
      release = (await response.json()) as typeof release;
    } else if (response.status === 422) {
      const details = await response.text();
      if (!details.includes('"code":"already_exists"')) {
        throw new Error(`GitHub release: ${details}`);
      }
      const existingResponse = await fetch(
        `https://api.github.com/repos/${github.owner}/${github.repo}/releases/tags/${encodeURIComponent(tagName)}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${github.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!existingResponse.ok) throw new Error(`GitHub release existente: ${await existingResponse.text()}`);
      release = (await existingResponse.json()) as typeof release;
    } else {
      const details = await response.text();
      if (response.status === 403) {
        throw new Error(
          `O GitHub App nao tem permissao Contents: Read and write para criar releases em ${github.owner}/${github.repo}. Atualize a permissao do App e reinstale-o no repositorio. Detalhes: ${details}`,
        );
      }
      throw new Error(`GitHub release: ${details}`);
    }
    const previousAsset = release.assets?.find((asset) => asset.name === assetName);
    if (previousAsset) {
      const deleteAssetResponse = await fetch(
        `https://api.github.com/repos/${github.owner}/${github.repo}/releases/assets/${previousAsset.id}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${github.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
      );
      if (!deleteAssetResponse.ok) throw new Error(`GitHub asset existente: ${await deleteAssetResponse.text()}`);
    }
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

/** Faz upload do latest.yml para um release já existente no GitHub. */
export async function uploadLatestYmlToRelease(input: {
  releaseId: number;
  latestYmlContent: string;
}): Promise<ActionResult<{ assetId: number }>> {
  await requireSuperAdmin();
  try {
    const github = await getGithubInstallationToken();
    const latestYmlBytes = Buffer.from(input.latestYmlContent, "utf-8");

    const deleteResponse = await fetch(
      `https://api.github.com/repos/${github.owner}/${github.repo}/releases/${input.releaseId}/assets`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${github.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (deleteResponse.ok) {
      const existingAssets = (await deleteResponse.json()) as Array<{ id: number; name: string }>;
      const existingYml = existingAssets.find((a) => a.name === "latest.yml");
      if (existingYml) {
        await fetch(
          `https://api.github.com/repos/${github.owner}/${github.repo}/releases/assets/${existingYml.id}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.github+json",
              Authorization: `Bearer ${github.token}`,
              "X-GitHub-Api-Version": "2022-11-28",
            },
          },
        );
      }
    }

    const uploadResponse = await fetch(
      `https://uploads.github.com/repos/${github.owner}/${github.repo}/releases/${input.releaseId}/assets?name=latest.yml`,
      {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${github.token}`,
          "Content-Type": "text/yaml",
        },
        body: latestYmlBytes,
      },
    );
    if (!uploadResponse.ok) {
      const details = await uploadResponse.text();
      throw new Error(`Falha ao enviar latest.yml: ${details}`);
    }
    const asset = (await uploadResponse.json()) as { id: number };
    return { ok: true, data: { assetId: asset.id } };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao enviar latest.yml.";
    console.error("[CS release] Falha ao enviar latest.yml:", error);
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

/**
 * Apaga a versão — se ela vier do GitHub, apaga o Release DE VERDADE lá
 * (instalador incluído), não só a linha daqui (achado 19/08/2026: o botão
 * de lixeira parecia só "esconder da lista", mas era destrutivo pra
 * valer). Por isso a trava abaixo: nunca deixa apagar a versão que o
 * GitHub considera "latest" agora — isso quebraria o auto-update de quem
 * já tem o Sync instalado, já que o `latest.yml`/instalador que ele
 * depende sumiriam junto.
 */
export async function deleteCsRelease(releaseId: string): Promise<ActionResult<null>> {
  await requireSuperAdmin();
  const service = createServiceClient();
  const { data: release } = await service
    .from("cs_releases")
    .select("file_url, file_name, version, github_release_id, github_tag_name")
    .eq("id", releaseId)
    .single();

  if (release?.github_release_id) {
    const latest = await fetchLatestGithubSetupRelease().catch(() => null);
    if (latest && latest.tagName === release.github_tag_name) {
      return {
        ok: false,
        error: `${latest.tagName} é a versão mais recente publicada no GitHub agora — apagar quebraria o auto-update de quem já tem o Sync instalado. Publique uma versão nova antes de apagar essa.`,
      };
    }
    const github = await getGithubInstallationToken();
    const deleteResponse = await fetch(
      `https://api.github.com/repos/${github.owner}/${github.repo}/releases/${release.github_release_id}`,
      {
        method: "DELETE",
        headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${github.token}`, "X-GitHub-Api-Version": "2022-11-28" },
      },
    );
    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      return { ok: false, error: `Falha ao apagar o Release no GitHub: ${await deleteResponse.text()}` };
    }
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
  return { ok: true, data: null };
}

/**
 * Compara a versão ativa em `cs_releases` com o "latest" de verdade do
 * GitHub — usado pra mostrar o aviso de dessincronia na tela (achado
 * 19/08/2026: a tabela ficou 12 dias travada numa versão velha sem
 * nenhum aviso visível).
 */
export async function getGithubLatestMismatch(activeVersion: string | null): Promise<{
  latest: GithubSetupAsset | null;
  mismatched: boolean;
}> {
  await requireSuperAdmin();
  try {
    const latest = await fetchLatestGithubSetupRelease();
    return { latest, mismatched: Boolean(latest) && latest?.version !== activeVersion };
  } catch {
    return { latest: null, mismatched: false };
  }
}

/** Botão "Sincronizar agora" — adota na hora o release mais recente do GitHub, sem precisar escolher no dropdown. */
export async function syncActiveCsReleaseWithGithubLatest(): Promise<ActionResult<null>> {
  await requireSuperAdmin();
  try {
    const latest = await fetchLatestGithubSetupRelease();
    if (!latest) return { ok: false, error: "Nenhum Release com instalador assistido encontrado no GitHub." };
    await upsertActiveCsRelease(latest);
    revalidatePath("/admin/cs-releases");
    revalidatePath("/configuracoes/meujudi-cs");
    return { ok: true, data: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao sincronizar com o GitHub.";
    return { ok: false, error: message };
  }
}
