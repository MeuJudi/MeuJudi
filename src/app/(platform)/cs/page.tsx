import { Download, MonitorCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CertServicePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">MeuJudi CS</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Conectar PJe pelo aplicativo local
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O instalador sera publicado aqui quando a integracao Web estiver ativa.
          </p>
        </div>
        <Card>
          <CardHeader>
            <MonitorCheck className="h-5 w-5 text-primary" />
            <CardTitle>Como vai funcionar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>
              O advogado instala o MeuJudi CS no Windows, conecta o PJe em uma janela segura e o
              app envia dados autorizados para o Supabase do escritorio.
            </p>
            <Button disabled>
              <Download className="h-4 w-4" />
              Download em breve
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

