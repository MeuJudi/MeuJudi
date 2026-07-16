import { Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <Card>
          <CardHeader>
            <Shield className="h-5 w-5 text-primary" />
            <CardTitle>Super admin</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            Acesso reservado para usuarios com role manual `super_admin`. Usuarios comuns nunca
            recebem essa permissao pelo cadastro.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

