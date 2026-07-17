import { BadgeDollarSign, CalendarDays, CheckCircle2, Clock3, FileText, Landmark, ReceiptText, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const nextFeatures = [
  { title: "Honorários e contratos", text: "Registre valores contratados, parcelas e condições combinadas com cada cliente.", icon: FileText },
  { title: "Contas a receber", text: "Acompanhe vencimentos, recebimentos e o que ainda está pendente.", icon: WalletCards },
  { title: "Custas e despesas", text: "Organize taxas, custas processuais e outros gastos ligados aos processos.", icon: ReceiptText },
  { title: "Visão do escritório", text: "Tenha um resumo claro de entradas, saídas e repasses para a equipe.", icon: Landmark },
];

export default function FinanceiroPage() {
  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Financeiro</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">
            Uma visão organizada dos honorários, recebimentos e despesas do escritório.
          </p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[var(--tenant-brass)]">
          <Clock3 className="mr-1 h-3.5 w-3.5" /> Em preparação
        </Badge>
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {[
          { label: "Recebimentos do mês", value: "Em breve", icon: WalletCards },
          { label: "Contas a vencer", value: "Em breve", icon: CalendarDays },
          { label: "Despesas registradas", value: "Em breve", icon: ReceiptText },
        ].map((metric) => (
          <Card key={metric.label} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className="text-sm text-[var(--color-muted-foreground)]">{metric.label}</p>
                <p className="mt-1 text-2xl font-semibold">{metric.value}</p>
              </div>
              <metric.icon className="h-6 w-6 text-primary" />
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[var(--tenant-brass)]">
              <BadgeDollarSign className="h-6 w-6" />
            </div>
            <h2 className="mt-5 font-display text-2xl font-semibold">Organização financeira, sem complicação</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-muted-foreground)]">
              Estamos preparando este módulo para reunir a rotina financeira do escritório com a mesma clareza dos processos, agenda e tarefas.
            </p>
            <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
              <CheckCircle2 className="h-4 w-4 text-[var(--tenant-moss)]" /> Os dados aparecerão aqui assim que o módulo for liberado.
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {nextFeatures.map((feature) => (
              <div key={feature.title} className="rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4">
                <feature.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">{feature.text}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
