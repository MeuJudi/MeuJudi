import { requireOwner } from "@/lib/auth/guards";
import { EscritorioForm } from "./escritorio-form";
import { EscritorioOabStatus } from "./escritorio-oab-status";

export default async function EscritorioPage() {
  const { supabase, profile } = await requireOwner();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", profile.tenant_id)
    .single();

  if (!tenant) {
    return <div className="text-muted-foreground">Escritório não encontrado.</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold">Dados do escritório</h2>
        <p className="text-sm text-muted-foreground">
          Informações gerais do seu escritório.
        </p>
      </div>
      <EscritorioForm tenant={tenant} />
      <EscritorioOabStatus />
    </div>
  );
}
