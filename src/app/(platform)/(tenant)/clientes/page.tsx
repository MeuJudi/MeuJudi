import { ClientesView, type ClientColumn, type ClientItem } from "./clientes-view";
import { requireAppUser } from "@/lib/auth/guards";

const defaults = [
  { name: "Novo contato", color: "#9a6a22" },
  { name: "Em atendimento", color: "#2563eb" },
  { name: "Aguardando documentos", color: "#7c3aed" },
  { name: "Cliente ativo", color: "#4b6b4e" },
];

async function resolveTenantId(supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"], profile: Awaited<ReturnType<typeof requireAppUser>>["profile"]) {
  if (profile.tenant_id) return profile.tenant_id;
  if (profile.role !== "super_admin") return null;
  const { data } = await supabase.from("tenants").select("id").eq("slug", "escritorio-demo-meujudi").maybeSingle();
  return data?.id ?? null;
}

export default async function ClientesPage() {
  const { supabase, profile } = await requireAppUser();
  const tenantId = await resolveTenantId(supabase, profile);
  if (!tenantId) return <ClientesView tenantId={null} columns={[]} clients={[]} />;

  let { data: columnRows } = await supabase.from("client_kanban_columns").select("id, name, position, color, is_default").eq("tenant_id", tenantId).eq("is_active", true).order("position");
  if (!columnRows?.length) {
    await supabase.from("client_kanban_columns").insert(defaults.map((column, position) => ({ ...column, position, is_default: true, tenant_id: tenantId, created_by: profile.id })));
    const { data } = await supabase.from("client_kanban_columns").select("id, name, position, color, is_default").eq("tenant_id", tenantId).eq("is_active", true).order("position");
    columnRows = data;
  }
  const columns = (columnRows ?? []) as ClientColumn[];
  const firstColumnId = columns[0]?.id;
  if (firstColumnId) await supabase.from("clientes").update({ kanban_column_id: firstColumnId }).eq("tenant_id", tenantId).is("kanban_column_id", null);
  const { data: clientRows } = await supabase.from("clientes").select("id, name, document, email, phone, notes, kanban_column_id, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false });
  return <ClientesView tenantId={tenantId} columns={columns} clients={(clientRows ?? []) as ClientItem[]} />;
}
