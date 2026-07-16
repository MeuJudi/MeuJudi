import Link from "next/link";
import { Building2, ClipboardList, Shield, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireSuperAdmin } from "@/lib/auth/guards";

export default async function AdminPage() {
  const { supabase } = await requireSuperAdmin();
  const [{ count: tenantsCount }, { count: usersCount }, { count: auditCount }] = await Promise.all([
    supabase.from("tenants").select("*", { count: "exact", head: true }),
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("audit_logs").select("*", { count: "exact", head: true }),
  ]);

  const metrics = [
    { label: "Ambientes", value: tenantsCount ?? 0, icon: Building2 },
    { label: "Usuarios", value: usersCount ?? 0, icon: Users },
    { label: "Eventos de auditoria", value: auditCount ?? 0, icon: ClipboardList },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">JudiCore Control</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Console operacional</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Controle global de clientes, ambientes, usuarios e auditoria da plataforma.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/dashboard">Abrir produto</Link>
        </Button>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
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

      <Card>
        <CardHeader>
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Regra de acesso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
          <p>
            Este console e separado dos produtos dos clientes. O acesso depende da role manual{" "}
            <code>super_admin</code>; usuarios comuns nunca recebem essa permissao pelo cadastro.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/admin/tenants">Ver ambientes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/audit">Ver auditoria</Link>
            </Button>
          </div>
        </CardContent>
        </Card>
    </div>
  );
}
