"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
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
export async function uploadCsRelease(formData: FormData) {
  const ctx = await requireSuperAdmin();
  const supabase = ctx.supabase;
  const profile = ctx.profile;

  const version = String(formData.get("version") ?? "").trim();
  const changelog = String(formData.get("changelog") ?? "").trim() || null;
  const file = formData.get("file") as File;

  if (!version) throw new Error("Versão é obrigatória.");
  if (!file || file.size === 0) throw new Error("Nenhum arquivo selecionado.");

  // Upload para Storage
  const fileExt = file.name.split(".").pop() ?? "exe";
  const filePath = `releases/v${version}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("cs-releases")
    .upload(filePath, buffer, {
      upsert: true,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    // Se o bucket não existe, cria automaticamente
    if (uploadError.message?.includes("Bucket not found")) {
      await supabase.storage.createBucket("cs-releases", {
        public: true,
        fileSizeLimit: 500 * 1024 * 1024, // 500MB
        allowedMimeTypes: [
          "application/octet-stream",
          "application/x-msdownload",
          "application/x-executable",
          "application/vnd.microsoft.portable-executable",
        ],
      });
      // Retry upload
      const { error: retryError } = await supabase.storage
        .from("cs-releases")
        .upload(filePath, buffer, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });
      if (retryError) throw retryError;
    } else {
      throw uploadError;
    }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("cs-releases").getPublicUrl(filePath);

  // Desativa todas as versões anteriores
  await supabase
    .from("cs_releases")
    .update({ is_active: false })
    .eq("is_active", true);

  // Insere nova versão
  const { error: insertError } = await supabase.from("cs_releases").insert({
    version,
    file_url: publicUrl,
    file_name: file.name,
    file_size_bytes: file.size,
    changelog,
    uploaded_by: profile.id,
    is_active: true,
  });

  if (insertError) throw insertError;

  revalidatePath("/admin/cs-releases");
  revalidatePath("/configuracoes/meujudi-cs");
  revalidatePath("/cs");
  return { success: true };
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
