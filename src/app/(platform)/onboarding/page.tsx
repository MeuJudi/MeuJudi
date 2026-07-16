import { CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { completeOnboarding } from "./actions";

const steps = [
  ["escritorio", "Escritorio", "Nome, cidade, estado e identidade visual."],
  ["equipe", "Equipe", "Convide socios, advogados e pessoas de apoio."],
  ["oabs", "OABs", "Informe as OABs que devem encontrar comunicacoes publicas."],
  ["processos", "Processos", "Adicione CNJs iniciais para acompanhamento."],
  ["preferencias", "Preferencias", "Escolha notificacoes e uso de IA."],
  ["finalizar", "Finalizar", "Revise e entre no painel."],
];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <p className="text-sm font-medium text-primary">Configuracao inicial</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Vamos preparar seu escritorio em poucos passos.
          </h1>
        </div>

        <Tabs defaultValue="escritorio">
          <TabsList className="grid grid-cols-2 md:grid-cols-6">
            {steps.map(([value, label]) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {steps.map(([value, label, text]) => (
            <TabsContent key={value} value={value}>
              {value === "escritorio" ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      Escritorio
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form action={completeOnboarding} className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="tenant_name">Nome do escritorio</Label>
                        <Input id="tenant_name" name="tenant_name" required />
                      </div>
                      <div className="space-y-2 sm:col-span-2">
                        <Label htmlFor="user_name">Seu nome</Label>
                        <Input id="user_name" name="user_name" required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">Cidade</Label>
                        <Input id="city" name="city" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">Estado</Label>
                        <Input id="state" name="state" maxLength={2} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oab_number">OAB principal</Label>
                        <Input id="oab_number" name="oab_number" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="oab_uf">UF da OAB</Label>
                        <Input id="oab_uf" name="oab_uf" maxLength={2} />
                      </div>
                      <Button className="sm:col-span-2" type="submit">
                        Salvar e entrar no painel
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-muted-foreground">
                    {text} Esta etapa sera ligada ao Supabase depois da base de escritorio estar criada.
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </main>
  );
}
