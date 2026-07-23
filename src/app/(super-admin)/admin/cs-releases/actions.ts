"use server";

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
};

/**
 * Busca a versão ativa do MeuJudi CS.
 * Usada pela página de download (qualquer autenticado).
 */
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

/**
 * Lista todas as versões (admin).
 */
export async function listCsReleases(): Promise<CsRelease[]> {
  const ctx = await requireSuperAdmin();
  const { data } = await ctx.supabase
    .from("cs_releases")
    .select("*")
    .order("uploaded_at", { ascending: false });

  return (data ?? []) as CsRelease[];
}

/**
 * Upload de nova versão do MeuJudi CS.
 * 1. Faz upload do arquivo para o bucket cs-releases
 * 2. Desativa todas as versões anteriores
 * 3. Cria registro na tabela cs_releases
 */
type CsReleaseUploadTicket = {
  bucket: string;
  path: string;
  token: string;
  publicUrl: string;
  fileName: string;
  fileSizeBytes: number;
  version: string;
  changelog: string | null;
};
type CsReleaseActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Prepara um upload direto para o Storage. O binário não passa pela Server
 * Action, evitando o limite de body da Vercel (o instalador pode ter dezenas
 * de MB).
 */
export async function createCsReleaseUploadTicket(input: {
  version: string;
  fileName: string;
  fileSizeBytes: number;
  contentType: string;
  changelog: string | null;
}): Promise<CsReleaseActionResult<CsReleaseUploadTicket>> {
  await requireSuperAdmin();
  try {
    const version = input.version.trim();
    const fileName = input.fileName.trim();
    if (!version) return { ok: false, error: "Versão é obrigatória." };
    if (!fileName || input.fileSizeBytes <= 0) {
      return { ok: false, error: "Nenhum arquivo selecionado." };
    }
    if (input.fileSizeBytes > 500 * 1024 * 1024) {
      return { ok: false, error: "O arquivo não pode ultrapassar 500 MB." };
    }

    const fileExt = fileName.split(".").pop() ?? "exe";
    const filePath = `releases/v${version}.${fileExt}`;
    const service = createServiceClient();
    let { data, error } = await service.storage
      .from("cs-releases")
      .createSignedUploadUrl(filePath);

    const storageErrorMessage = error?.message?.toLowerCase() ?? "";
    const bucketIsMissing =
      storageErrorMessage.includes("bucket not found") ||
      storageErrorMessage.includes("related resource does not exist") ||
      storageErrorMessage.includes("bucket does not exist");

    if (bucketIsMissing) {
      const { error: bucketError } = await service.storage.createBucket("cs-releases", {
        public: true,
        fileSizeLimit: "500MB",
        allowedMimeTypes: [
          "application/octet-stream",
          "application/x-msdownload",
          "application/x-executable",
          "application/vnd.microsoft.portable-executable",
        ],
      });
      if (bucketError && !bucketError.message?.toLowerCase().includes("already exists")) {
        return { ok: false, error: `Storage: ${bucketError.message}` };
      }
      ({ data, error } = await service.storage
        .from("cs-releases")
        .createSignedUploadUrl(filePath));
    }

    // O bucket pode ter sido criado anteriormente com o limite padrão de 50 MB.
    // Atualizamos antes do upload; o limite global do plano ainda prevalece.
    const { error: limitError } = await service.storage.updateBucket("cs-releases", {
      public: true,
      fileSizeLimit: "500MB",
      allowedMimeTypes: [
        "application/octet-stream",
        "application/x-msdownload",
        "application/x-executable",
        "application/vnd.microsoft.portable-executable",
      ],
    });
    if (limitError) {
      console.error("[CS release] Limite do bucket não pode ser atualizado:", limitError);
      return {
        ok: false,
        error: `Storage: ${limitError.message}. Verifique o limite global do Storage e o plano do Supabase.`,
      };
    }

    if (error || !data) {
      const message = error?.message ?? "Não foi possível preparar o upload.";
      console.error("[CS release] Falha ao criar upload assinado:", message);
      return { ok: false, error: `Storage: ${message}` };
    }

    const { data: publicData } = service.storage.from("cs-releases").getPublicUrl(filePath);
    return {
      ok: true,
      data: {
        bucket: "cs-releases",
        path: filePath,
        token: data.token,
        publicUrl: publicData.publicUrl,
        fileName,
        fileSizeBytes: input.fileSizeBytes,
        version,
        changelog: input.changelog?.trim() || null,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha desconhecida no Storage.";
    console.error("[CS release] Falha inesperada ao preparar upload:", error);
    return { ok: false, error: message };
  }
}

/** Registra no banco um arquivo que já foi enviado diretamente ao Storage. */
export async function finalizeCsReleaseUpload(
  ticket: CsReleaseUploadTicket,
): Promise<CsReleaseActionResult<null>> {
  const ctx = await requireSuperAdmin();
  const supabase = ctx.supabase;
  const profile = ctx.profile;

  // Desativa todas as versões anteriores
  const { error: deactivateError } = await supabase
    .from("cs_releases")
    .update({ is_active: false })
    .eq("is_active", true);
  if (deactivateError) {
    console.error("[CS release] Falha ao desativar versões anteriores:", deactivateError);
    return { ok: false, error: `Banco: ${deactivateError.message}` };
  }

  // Insere nova versão
  const { error: insertError } = await supabase.from("cs_releases").insert({
    version: ticket.version,
    file_url: ticket.publicUrl,
    file_name: ticket.fileName,
    file_size_bytes: ticket.fileSizeBytes,
    changelog: ticket.changelog,
    uploaded_by: profile.id,
    is_active: true,
  });

  if (insertError) {
    console.error("[CS release] Falha ao registrar versão:", insertError);
    return { ok: false, error: `Banco: ${insertError.message}` };
  }

  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
  revalidatePath("/cs");
  return { ok: true, data: null };
}

/**
 * Desativa uma versão (admin).
 */
export async function deactivateCsRelease(releaseId: string) {
  const ctx = await requireSuperAdmin();
  await ctx.supabase
    .from("cs_releases")
    .update({ is_active: false })
    .eq("id", releaseId);

  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
}

/**
 * Ativa uma versão (admin).
 */
export async function activateCsRelease(releaseId: string) {
  const ctx = await requireSuperAdmin();

  // Desativa todas as outras
  await ctx.supabase
    .from("cs_releases")
    .update({ is_active: false })
    .neq("id", releaseId);

  // Ativa a selecionada
  await ctx.supabase
    .from("cs_releases")
    .update({ is_active: true })
    .eq("id", releaseId);

  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
}

/**
 * Deleta uma versão e seu arquivo do Storage (admin).
 */
export async function deleteCsRelease(releaseId: string) {
  const ctx = await requireSuperAdmin();
  const supabase = ctx.supabase;

  // Busca o registro para pegar o caminho do arquivo
  const { data: release } = await supabase
    .from("cs_releases")
    .select("file_url, file_name, version")
    .eq("id", releaseId)
    .single();

  if (release) {
    // Tenta remover do Storage
    const fileExt = release.file_name.split(".").pop() ?? "exe";
    const filePath = `releases/v${release.version}.${fileExt}`;
    await supabase.storage.from("cs-releases").remove([filePath]);
  }

  await supabase.from("cs_releases").delete().eq("id", releaseId);

  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
}
