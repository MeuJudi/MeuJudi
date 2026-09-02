"use server";

import { revalidatePath } from "next/cache";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { sendSupportAnswerEmail } from "@/lib/email/send-support-answer";

export type SupportReportWithTenant = {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  user_email: string | null;
  report_type: string;
  title: string;
  description: string;
  screenshot_url: string | null;
  page_url: string | null;
  status: string;
  answer: string | null;
  answered_at: string | null;
  answered_by: string | null;
  created_at: string;
  updated_at: string;
  tenants: { name: string; slug: string } | null;
};

export async function getAllSupportReports(filters?: {
  status?: string;
  reportType?: string;
  tenantId?: string;
}): Promise<SupportReportWithTenant[]> {
  const { supabase } = await requireSuperAdmin();

  let query = supabase
    .from("support_reports")
    .select("*, tenants(name, slug)")
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters?.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters?.reportType && filters.reportType !== "all") {
    query = query.eq("report_type", filters.reportType);
  }
  if (filters?.tenantId && filters.tenantId !== "all") {
    query = query.eq("tenant_id", filters.tenantId);
  }

  const { data, error } = await query;
  if (error) return [];
  return (data as SupportReportWithTenant[]) ?? [];
}

export async function getSupportReportById(reportId: string): Promise<SupportReportWithTenant | null> {
  const { supabase } = await requireSuperAdmin();

  const { data, error } = await supabase
    .from("support_reports")
    .select("*, tenants(name, slug)")
    .eq("id", reportId)
    .single();

  if (error) return null;
  return data as SupportReportWithTenant;
}

export async function answerSupportReport(
  reportId: string,
  answer: string,
): Promise<{ error?: string; ok?: boolean }> {
  const { profile, supabase } = await requireSuperAdmin();

  const trimmed = answer.trim();
  if (trimmed.length < 2) return { error: "Escreva a resposta." };

  const { error } = await supabase
    .from("support_reports")
    .update({
      answer: trimmed,
      answered_at: new Date().toISOString(),
      answered_by: profile.id,
      status: "respondido",
    })
    .eq("id", reportId);

  if (error) return { error: "Nao foi possivel salvar a resposta." };

  // Envia email de notificação pro tenant (fire and forget)
  const { data: reportData } = await supabase
    .from("support_reports")
    .select("user_email, user_name, title, report_type, tenant_id, user_id")
    .eq("id", reportId)
    .single();

  if (reportData?.user_email) {
    const { data: tenantData } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", reportData.tenant_id)
      .single();

    sendSupportAnswerEmail({
      to: reportData.user_email,
      tenantName: tenantData?.name ?? "Meu Judi",
      userName: reportData.user_name,
      reportTitle: reportData.title,
      answer: trimmed,
      reportType: reportData.report_type,
    }).catch(() => undefined);
  }

  // Cria notificação in-app pro tenant
  if (reportData?.user_id) {
    const typeLabels: Record<string, string> = { bug: "erro", sugestao: "sugestão", duvida: "dúvida" };
    await supabase.from("notifications").insert({
      tenant_id: reportData.tenant_id,
      user_id: reportData.user_id,
      type: "support_answer",
      title: `Sua ${typeLabels[reportData.report_type] ?? "report"} foi respondida`,
      message: `"${reportData.title}" recebeu uma resposta do suporte.`,
      link: "/configuracoes/ajuda",
    });
  }

  revalidatePath("/admin/ajuda");
  revalidatePath(`/admin/ajuda/${reportId}`);
  return { ok: true };
}

export async function setSupportReportStatus(
  reportId: string,
  status: string,
): Promise<{ error?: string; ok?: boolean }> {
  const { supabase } = await requireSuperAdmin();

  const validStatuses = ["novo", "em_andamento", "respondido", "arquivado"];
  if (!validStatuses.includes(status)) return { error: "Status invalido." };

  const { error } = await supabase
    .from("support_reports")
    .update({ status })
    .eq("id", reportId);

  if (error) return { error: "Nao foi possivel atualizar o status." };

  revalidatePath("/admin/ajuda");
  revalidatePath(`/admin/ajuda/${reportId}`);
  return { ok: true };
}

export async function getTenantOptions(): Promise<{ id: string; name: string }[]> {
  const { supabase } = await requireSuperAdmin();

  const { data, error } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("is_active", true)
    .order("name");

  if (error) return [];
  return (data as { id: string; name: string }[]) ?? [];
}
