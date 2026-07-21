import { requireAppUser } from "@/lib/auth/guards";
import { ItemRevisaoCard } from "./item-revisao-card";

interface ItemRevisaoRow {
  id: string;
  campo: string;
  texto_original: string;
  trecho_destacado: string | null;
  valor_sugerido: Record<string, unknown> | null;
  confianca: string;
  processo: { cnj: string; classe_nome: string | null } | null;
}

export default async function CentralRevisaoPage() {
  const { supabase } = await requireAppUser();

  const { data: itens } = await supabase
    .from("itens_revisao")
    .select("id, campo, texto_original, trecho_destacado, valor_sugerido, confianca, processo:processos(cnj, classe_nome)")
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .returns<ItemRevisaoRow[]>();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Central de Revisão</h1>
        <p className="text-muted-foreground">
          Itens que o sistema não teve certeza suficiente pra decidir sozinho. Sua confirmação ou correção
          ajuda o sistema a aprender e a precisar de você cada vez menos.
        </p>
      </div>

      {(!itens || itens.length === 0) && (
        <p className="text-muted-foreground">Nenhum item pendente. Tudo revisado!</p>
      )}

      <div className="space-y-4">
        {itens?.map((item) => (
          <ItemRevisaoCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
