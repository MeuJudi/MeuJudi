import { requireOwner } from "@/lib/auth/guards";
import { HonorariosView } from "./honorarios-view";

export default async function HonorariosPage() {
  const { supabase, profile } = await requireOwner();

  const { data: honorarios } = await supabase
    .from("honorarios_sugeridos")
    .select(
      "id, categoria, servico, descricao, unidade, valor_sugerido_oab, valor_minimo, valor_maximo, valor_escritorio, base_legal, ativo, customizado"
    )
    .eq("tenant_id", profile.tenant_id)
    .order("categoria", { ascending: true })
    .order("servico", { ascending: true });

  return <HonorariosView initial={honorarios ?? []} />;
}
