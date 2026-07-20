import type { SupabaseClient } from "@supabase/supabase-js";

export type MaintenanceWindow = {
  id: string;
  scope: "tenant" | "platform";
  tenant_id: string | null;
  title: string;
  message: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "active" | "completed" | "cancelled";
};

export async function getRelevantMaintenance(supabase: SupabaseClient, tenantId: string, mode: "active" | "upcoming" | "all" = "all") {
  const now = new Date().toISOString();
  let query = supabase
    .from("maintenance_windows")
    .select("id, scope, tenant_id, title, message, starts_at, ends_at, status")
    .or(`scope.eq.platform,tenant_id.eq.${tenantId}`)
    .neq("status", "cancelled")
    .gt("ends_at", now)
    .order("starts_at", { ascending: true });

  if (mode === "active") query = query.lte("starts_at", now);
  if (mode === "upcoming") query = query.gt("starts_at", now);

  const { data, error } = await query;
  if (error) return [] as MaintenanceWindow[];
  return (data ?? []) as MaintenanceWindow[];
}

