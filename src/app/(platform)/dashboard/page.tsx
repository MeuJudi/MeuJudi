import Link from "next/link";
import { CalendarDays, Download, FileText, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const metrics = [
  { label: "Processos monitorados", value: "0", icon: FileText },
  { label: "Audiencias detectadas", value: "0", icon: CalendarDays },
  { label: "Pessoas na equipe", value: "1", icon: Users },
  { label: "RLS e auditoria", value: "Base", icon: ShieldCheck },
];

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Badge>MeuJudi MVP</Badge>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Painel do escritorio</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Dados reais entram depois que Supabase, RLS e fontes forem conectados.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/cs">
              <Download className="h-4 w-4" />
              MeuJudi CS
            </Link>
          </Button>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.label}>
              <CardHeader>
                <metric.icon className="h-5 w-5 text-primary" />
                <CardTitle>{metric.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{metric.value}</CardContent>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}

