import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const columns = [
  {
    title: "A fazer",
    tasks: [
      ["Revisar movimentacao nova", "Acao de Cobranca - Mercado Central", "Alta"],
      ["Separar documentos", "Inventario - Espolio Ferraz", "Media"],
    ],
  },
  {
    title: "Em andamento",
    tasks: [["Preparar quesitos periciais", "Divorcio Litigioso - Familia Ramos", "Alta"]],
  },
  {
    title: "Aguardando",
    tasks: [["Retorno do cliente", "Insumos Bertoni ME", "Baixa"]],
  },
  {
    title: "Concluido",
    tasks: [["Enviar procuracao assinada", "Mercado Central Ltda.", "Baixa"]],
  },
];

const priorityClass: Record<string, string> = {
  Alta: "bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] text-[var(--tenant-wine)]",
  Media: "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[#8c6425]",
  Baixa: "bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] text-[var(--tenant-moss)]",
};

export default function TarefasPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Tarefas</h1>
        <p className="mt-2 text-sm text-muted-foreground">Trabalho interno do escritorio ligado a processos, clientes ou atividades avulsas.</p>
      </header>

      <section className="grid gap-4 lg:grid-cols-4">
        {columns.map((column) => (
          <div key={column.title} className="rounded-lg border border-border bg-muted/40 p-3">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
              {column.title}
              <span className="rounded-full bg-secondary px-2 py-0.5 font-mono">{column.tasks.length}</span>
            </div>
            <div className="space-y-3">
              {column.tasks.map(([title, description, priority]) => (
                <Card key={title}>
                  <CardContent className="p-3">
                    <p className="font-semibold text-sm text-[var(--color-card-foreground)]">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
                    <Badge className={`mt-3 uppercase tracking-wide ${priorityClass[priority]}`}>{priority}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
