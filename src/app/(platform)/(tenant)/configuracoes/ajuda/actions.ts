"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser } from "@/lib/auth/guards";

const MAX_SIZE_BYTES = 5 * 1024 * 1024;

function extractExtension(file: File): string {
  const dotIndex = file.name.lastIndexOf(".");
  if (dotIndex !== -1 && dotIndex < file.name.length - 1) {
    return file.name.slice(dotIndex + 1).toLowerCase();
  }
  const mime = file.type.split("/")[1];
  return mime ? mime.toLowerCase().replace("jpeg", "jpg") : "png";
}

export async function submitSupportReport(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const { profile, supabase } = await requireAppUser();

  const reportTypeRaw = formData.get("report_type");
  const reportType = reportTypeRaw === "sugestao" ? "sugestao" : reportTypeRaw === "duvida" ? "duvida" : "bug";
  const title = (formData.get("title") as string | null)?.trim() ?? "";
  const description = (formData.get("description") as string | null)?.trim() ?? "";
  const pageUrl = (formData.get("page_url") as string | null)?.trim() || null;
  const file = formData.get("screenshot") as File | null;

  if (title.length < 2) return { error: "Escreva um titulo curto." };
  if (description.length < 5) return { error: "Descreva um pouco mais o que aconteceu." };

  if (file && file.size > 0) {
    if (!file.type.startsWith("image/")) return { error: `Tipo de arquivo invalido: "${file.type}". Apenas imagens sao aceitas.` };
    if (file.size > MAX_SIZE_BYTES) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      return { error: `Imagem muito grande: ${sizeMB} MB. O limite e 5 MB.` };
    }
  }

  let screenshotUrl: string | null = null;

  // Upload screenshot to Supabase Storage
  if (file && file.size > 0) {
    const ext = extractExtension(file);
    const path = `${profile.tenant_id}/ajuda/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage.from("support-screenshots").upload(path, file, {
      upsert: true,
      contentType: file.type,
    });

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("support-screenshots").getPublicUrl(path);
      screenshotUrl = urlData.publicUrl;
    }
  }

  const { error } = await supabase.from("support_reports").insert({
    tenant_id: profile.tenant_id,
    user_id: profile.id,
    user_name: profile.name,
    user_email: profile.email,
    report_type: reportType,
    title,
    description,
    screenshot_url: screenshotUrl,
    page_url: pageUrl,
  });

  if (error) return { error: "Nao foi possivel registrar o report." };

  revalidatePath("/configuracoes/ajuda");
  return { ok: true };
}

export async function getMySupportReports() {
  const { profile, supabase } = await requireAppUser();

  const { data, error } = await supabase
    .from("support_reports")
    .select("id, report_type, title, description, screenshot_url, page_url, status, answer, answered_at, created_at")
    .eq("tenant_id", profile.tenant_id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return [];
  return data ?? [];
}
