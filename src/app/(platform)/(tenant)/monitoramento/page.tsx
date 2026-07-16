import { Bell, CalendarDays, FileText, MonitorCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const processes = [
  {
    cnj: "0001234-56.2024.8.26.0100",
    title: "Acao de Cobranca - Mercado Central Ltda.",
    meta: "Juntada de peticao do requerido - ha 2 horas",
    court: "TJSP",
    status: "Em andamento",
    fresh: true,
  },
  {
    cnj: "0004567-89.2023.5.02.0040",
    title: "Reclamacao Trabalhista - J. Andrade",
    meta: "Audiencia de instrucao designada - ha 1 dia",
    court: "TRT-2",
    status: "Em andamento",
  },
  {
    cnj: "0007890-12.2024.8.26.0224",
    title: "Divorcio Litigioso - Familia Ramos",
    meta: "Aguardando manifestacao da parte contraria",
    court: "TJSP",
    status: "Aguardando",
  },
  {
    cnj: "1002345-67.2022.4.03.6100",
    title: "Execucao Fiscal - Insumos Bertoni ME",
    meta: "Penhora on-line em analise - ha 3 dias",
    court: "TRF-3",
    status: "Em andamento",
  },
];

const metrics = [
  { label: "Processos ativos", value: "12", icon: FileText },
  { label: "Novos hoje", value: "3", icon: Bell },
  { label: "Prazos proximos", value: "5", icon: CalendarDays },
  { label: "CS/PJe", value: "Pendente", icon: MonitorCheck },
];

export default function MonitoramentoPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">
            Monitoramento de processos
          </h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--color-muted-foreground)]">
            Atualizacoes puxadas automaticamente dos tribunais, com foco no que precisa da sua atencao hoje.
          </p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">
          12 processos ativos
        </Badge>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="pb-3">
              <metric.icon className="h-5 w-5 text-primary" />
              <CardTitle className="text-sm">{metric.label}</CardTitle>
            </CardHeader>
            <CardContent className="text-2xl font-semibold">{metric.value}</CardContent>
          </Card>
        ))}
      </section>

      <Tabs defaultValue="lista">
        <TabsList className="rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="lista" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
            Lista
          </TabsTrigger>
          <TabsTrigger value="kanban" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
            Kanban
          </TabsTrigger>
          <TabsTrigger value="mural" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">
            Mural/descobertas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="lista" className="space-y-3">
          {processes.map((process) => (
            <Card key={process.cnj} className="transition-shadow hover:shadow-md">
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-[260px] flex-1">
                  <p className="font-mono text-xs text-muted-foreground">{process.cnj}</p>
                  <h2 className="mt-1 font-semibold text-[var(--color-card-foreground)]">{process.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{process.meta}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {process.fresh ? <Badge className="border-[var(--tenant-wine)] bg-transparent text-[var(--tenant-wine)]">Novo hoje</Badge> : null}
                  <Badge variant="outline">{process.court}</Badge>
                  <Badge className="bg-[color-mix(in_srgb,var(--tenant-brass)_16%,transparent)] text-[#8c6425]">{process.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
        <TabsContent value="kanban">
          <div className="grid gap-4 md:grid-cols-3">
            {["Em processo", "Aguardando tribunal", "Concluido"].map((column) => (
              <div key={column} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-3 flex items-center justify-between text-xs font-semibold uppercase text-muted-foreground">
                  {column}
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-mono">1</span>
                </div>
                <Card>
                  <CardContent className="p-3">
                    <p className="font-semibold text-sm">Acao de Cobranca</p>
                    <p className="mt-1 text-xs text-muted-foreground">Mercado Central Ltda.</p>
                    <p className="mt-3 font-mono text-[11px] text-muted-foreground">0001234-56</p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="mural">
          <Card>
            <CardContent className="p-5 text-sm text-muted-foreground">
              Comunicacoes publicas encontradas pelo pipeline global aparecerao aqui somente quando houver vinculo confirmado com CNJ/OAB do escritorio.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
