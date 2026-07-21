import { requireAppUser } from "@/lib/auth/guards";
import { SugestaoCard } from "./sugestao-card";

interface SugestaoRow {
  id: string;
  nome_detectado: string;
  polo: "autor" | "reu";
  tipo: "vincular_existente" | "criar_novo";
  similaridade: number | null;
  processo: { cnj: string; classe_nome: string | null } | null;
  cliente_sugerido: { name: string } | null;
}

export default async function SugestoesClientePage() {
  const { supabase } = await requireAppUser();

  const { data: sugestoes } = await supabase
    .from("sugestoes_vinculo_cliente")
    .select(
      "id, nome_detectado, polo, tipo, similaridade, processo:processos(cnj, classe_nome), cliente_sugerido:clientes!cliente_id_sugerido(name)",
    )
    .eq("status", "pendente")
    .order("created_at", { ascending: true })
    .returns<SugestaoRow[]>();

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Sugestões de cliente</h1>
        <p className="text-muted-foreground">
          Processos novos descobertos automaticamente pelo Mural, com sugestão de qual cliente é —
          ou de criar um cliente novo. Nome não é identificador único, então toda sugestão precisa
          da sua confirmação antes de vincular ou criar qualquer coisa.
        </p>
      </div>

      {(!sugestoes || sugestoes.length === 0) && (
        <p className="text-muted-foreground">Nenhuma sugestão pendente.</p>
      )}

      <div className="space-y-4">
        {sugestoes?.map((sugestao) => (
          <SugestaoCard key={sugestao.id} sugestao={sugestao} />
        ))}
      </div>
    </div>
  );
}
