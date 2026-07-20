import { TarefasView, type TaskColumn, type TaskItem, type TaskUser } from "./tarefas-view";
import { requireAppUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

const defaults = [
  { name: "A fazer", color: "#9a6a22" },
  { name: "Em andamento", color: "#2563eb" },
  { name: "Aguardando", color: "#7c3aed" },
  { name: "Concluído", color: "#4b6b4e" },
];

async function resolveTenantId(
  supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"],
  profile: Awaited<ReturnType<typeof requireAppUser>>["profile"],
) {
  if (profile.tenant_id) return profile.tenant_id;
  if (profile.role !== "super_admin") return null;

  const { data } = await supabase.from("tenants").select("id").eq("slug", "escritorio-demo-meujudi").maybeSingle();
  return data?.id ?? null;
}

export default async function TarefasPage() {
  const { supabase, profile } = await requireAppUser();
  const tenantId = await resolveTenantId(supabase, profile);
  if (!tenantId) return <TarefasView tenantId={null} columns={[]} tasks={[]} users={[]} currentUser={{ id: profile.id, name: profile.name, email: profile.email, avatar_url: null }} />;

  let { data: columnRows } = await supabase.from("task_kanban_columns").select("id, name, position, color, is_default").eq("tenant_id", tenantId).eq("is_active", true).order("position");
  if (!columnRows?.length) {
    await supabase
      .from("task_kanban_columns")
      .insert(defaults.map((column, position) => ({ ...column, position, is_default: true, tenant_id: tenantId, created_by: profile.id })));

    const { data } = await supabase
      .from("task_kanban_columns")
      .select("id, name, position, color, is_default")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("position");
    columnRows = data;
  }
  const columns = (columnRows ?? []) as TaskColumn[];
  const firstColumn = columns[0]?.id ?? null;
  if (firstColumn) await supabase.from("tarefas").update({ kanban_column_id: firstColumn }).eq("tenant_id", tenantId).is("kanban_column_id", null);
  const { data: taskRows, error: taskError } = await supabase.from("tarefas").select("id, title, description, priority, due_date, kanban_column_id, created_by, responsible_id, processo_id, assigned_to, parent_task_id, is_private, visibility, checklist, comments, attachments").eq("tenant_id", tenantId).order("created_at", { ascending: false });

  const { data: userRows } = await supabase.from("users").select("id, name, email, avatar_url").eq("tenant_id", tenantId);

  return <TarefasView tenantId={tenantId} columns={columns} tasks={(taskRows ?? []) as TaskItem[]} users={(userRows ?? []) as TaskUser[]} currentUser={{ id: profile.id, name: profile.name, email: profile.email, avatar_url: (profile as Record<string, unknown>).avatar_url as string | null }} loadError={taskError?.message ?? null} />;
}
