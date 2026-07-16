import { BadgeDollarSign, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const futureItems = [
  "Honorarios contratados",
  "Parcelas e vencimentos",
  "Recebimentos",
  "Despesas do processo",
  "Custas e taxas",
  "Repasses por advogado/socio",
  "Relatorios financeiros",
];

export default function FinanceiroPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Financeiro</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Este modulo ficara disponivel depois do nucleo juridico do MVP. Ele vai organizar a parte financeira ligada ao escritorio e aos processos.
          </p>
        </div>
        <Badge className="bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[#8c6425]">
          <Clock3 className="mr-1 h-3 w-3" />
          Em breve
        </Badge>
      </header>

      <Card>
        <CardHeader>
          <BadgeDollarSign className="h-5 w-5 text-primary" />
          <CardTitle>O que vai aparecer aqui</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {futureItems.map((item) => (
            <div key={item} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-[var(--color-card-foreground)]">
              {item}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
