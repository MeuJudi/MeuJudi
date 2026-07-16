import { MessageSquareText, PhoneCall } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const clients = [
  ["Mercado Central Ltda.", "1", "ha 2 dias", "Ativo"],
  ["J. Andrade", "1", "ha 5 dias", "Ativo"],
  ["Familia Ramos", "1", "ha 1 dia", "Aguardando retorno"],
  ["Insumos Bertoni ME", "1", "ha 6 dias", "Ativo"],
];

export default function ClientesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Clientes</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cadastro e historico de relacionamento com cada cliente do escritorio.</p>
      </header>

      <Tabs defaultValue="clientes">
        <TabsList className="rounded-none border-b bg-transparent p-0">
          <TabsTrigger value="clientes" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">Clientes</TabsTrigger>
          <TabsTrigger value="crm" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:shadow-none">CRM</TabsTrigger>
        </TabsList>
        <TabsContent value="clientes">
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Processos</th>
                    <th className="px-4 py-3">Ultimo contato</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(([name, processes, lastContact, status]) => (
                    <tr key={name} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-3 font-medium text-[var(--color-card-foreground)]">{name}</td>
                      <td className="px-4 py-3">{processes}</td>
                      <td className="px-4 py-3 text-muted-foreground">{lastContact}</td>
                      <td className="px-4 py-3">
                        <Badge className={status === "Ativo" ? "bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]" : "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,transparent)] text-[#8c6425]"}>
                          {status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="crm" className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Funil simples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {["Novo contato", "Em atendimento", "Aguardando documentos"].map((stage) => (
                <div key={stage} className="rounded-md border bg-muted/30 p-3 text-sm">{stage}</div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Historico recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-3 rounded-md border p-3">
                <MessageSquareText className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground"><strong className="text-foreground">Familia Ramos:</strong> mensagem sobre proxima audiencia respondida hoje.</p>
              </div>
              <div className="flex gap-3 rounded-md border p-3">
                <PhoneCall className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground"><strong className="text-foreground">J. Andrade:</strong> reuniao de preparacao de audiencia agendada.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
