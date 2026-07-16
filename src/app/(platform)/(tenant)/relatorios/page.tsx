import { BarChart3, CalendarClock, FileText, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const reports = [
  { title: "Processos por status", value: "12 ativos", icon: FileText },
  { title: "Prazos por periodo", value: "5 proximos", icon: CalendarClock },
  { title: "Tarefas por responsavel", value: "4 pessoas", icon: Users },
  { title: "Movimentacoes por tribunal", value: "3 novas", icon: BarChart3 },
];

export default function RelatoriosPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Relatorios</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Visoes consolidadas do escritorio para acompanhar processos, prazos, tarefas e comunicacoes sem transformar o MVP em BI complexo.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        {reports.map((report) => (
          <Card key={report.title}>
            <CardHeader>
              <report.icon className="h-5 w-5 text-primary" />
              <CardTitle>{report.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{report.value}</CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Proximas visoes</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <p>Relatorio por cliente, com processos vinculados e ultimo contato.</p>
          <p>Relatorio de risco, destacando prazos criticos e comunicacoes pendentes.</p>
          <p>Exportacao em PDF/CSV quando os dados reais estiverem conectados.</p>
          <p>Indicadores financeiros quando o modulo financeiro for liberado.</p>
        </CardContent>
      </Card>
    </div>
  );
}
