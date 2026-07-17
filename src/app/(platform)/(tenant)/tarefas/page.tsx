import { TarefasView, type TaskColumn, type TaskItem } from "./tarefas-view";
import { requireAppUser } from "@/lib/auth/guards";

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
  if (!tenantId) return <TarefasView tenantId={null} columns={[]} tasks={[]} />;

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
  const { data: taskRows } = await supabase.from("tarefas").select("id, title, description, priority, due_date, kanban_column_id").eq("tenant_id", tenantId).order("created_at", { ascending: false });

  return <TarefasView tenantId={tenantId} columns={columns} tasks={(taskRows ?? []) as TaskItem[]} />;
}
