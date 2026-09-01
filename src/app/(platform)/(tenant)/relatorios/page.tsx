import { RelatoriosView, type ReportData } from "./relatorios-view";
import { requireAppUser } from "@/lib/auth/guards";
import { getProcessIdsForTenant } from "@/lib/processos/helpers";

// Mesmo limite de monitoramento/page.tsx — evita estourar o tamanho da URL
// num `.in("id", ...)` quando o tenant tem muitos processos vinculados
// (achado 01/09/2026).
const PROCESS_ID_CHUNK_SIZE = 200;

async function resolveTenantId(supabase: Awaited<ReturnType<typeof requireAppUser>>["supabase"], profile: Awaited<ReturnType<typeof requireAppUser>>["profile"]) {
  if (profile.tenant_id) return profile.tenant_id;
  if (profile.role !== "super_admin") return null;
  const { data } = await supabase.from("tenants").select("id").eq("slug", "escritorio-demo-meujudi").maybeSingle();
  return data?.id ?? null;
}

export default async function RelatoriosPage() {
  const { supabase, profile } = await requireAppUser();
  const tenantId = await resolveTenantId(supabase, profile);
  if (!tenantId) return <RelatoriosView data={{ processes: [], clients: 0, tasks: [], movements: 0 }} />;

  const [{ data: processes }, { count: clients }, { data: tasks }, { count: movements }] = await Promise.all([
    // Buscar IDs via processo_participantes, depois buscar processos
    (async () => {
      const ids = await getProcessIdsForTenant(supabase, tenantId);
      if (ids.length === 0) return { data: [], error: null } as const;
      const rows: ReportData["processes"] = [];
      for (let from = 0; from < ids.length; from += PROCESS_ID_CHUNK_SIZE) {
        const { data, error } = await supabase
          .from("processos")
          .select("id, status, tribunal, prazo_proxima_resposta")
          .in("id", ids.slice(from, from + PROCESS_ID_CHUNK_SIZE));
        if (error) return { data: null, error } as const;
        rows.push(...(data ?? []));
      }
      return { data: rows, error: null } as const;
    })(),
    supabase.from("clientes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    supabase.from("tarefas").select("id, priority, due_date").eq("tenant_id", tenantId),
    supabase.from("movimentacoes").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_novo", true),
  ]);

  const data: ReportData = {
    processes: (processes ?? []) as ReportData["processes"],
    clients: clients ?? 0,
    tasks: (tasks ?? []) as ReportData["tasks"],
    movements: movements ?? 0,
  };

  return <RelatoriosView data={data} />;
}
