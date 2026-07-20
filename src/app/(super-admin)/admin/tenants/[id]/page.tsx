import Link from "next/link";
import { ArrowLeft, Building2, ClipboardList, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { setTenantStatus } from "../../actions";
import { roleLabel } from "@/lib/auth/labels";

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireSuperAdmin();
  const [{ data: tenant, error: tenantError }, { data: users }, { data: auditLogs }] =
    await Promise.all([
      supabase
        .from("tenants")
        .select("id, name, slug, city, state, is_active, is_free_mvp, created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("users")
        .select("id, name, email, role, gender, is_active, created_at")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("audit_logs")
        .select("id, action, entity, category, severity, created_at")
        .eq("tenant_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  if (tenantError) {
    throw new Error(tenantError.message);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link href="/admin/tenants">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Link>
      </Button>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary">Cliente</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{tenant.name}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tenant.slug} · {[tenant.city, tenant.state].filter(Boolean).join(" / ") || "Sem local"}
          </p>
        </div>
        <form action={setTenantStatus}>
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="is_active" value={String(!tenant.is_active)} />
          <Button type="submit" variant={tenant.is_active ? "destructive" : "default"}>
            {tenant.is_active ? "Suspender cliente" : "Reativar cliente"}
          </Button>
        </form>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={tenant.is_active ? "default" : "secondary"}>
              {tenant.is_active ? "Ativo" : "Suspenso"}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Users className="h-5 w-5 text-primary" />
            <CardTitle>Usuários</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{users?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <ClipboardList className="h-5 w-5 text-primary" />
            <CardTitle>Auditoria recente</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{auditLogs?.length ?? 0}</CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Equipe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {users?.map((user) => (
              <div key={user.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                <div>
                  <p className="font-medium">{user.name}</p>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant="outline">{roleLabel(user.role, user.gender)}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Auditoria</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {auditLogs?.map((log) => (
              <div key={log.id} className="border-b pb-3 last:border-0">
                <p className="font-mono text-xs">{log.action}</p>
                <p className="text-sm text-muted-foreground">
                  {log.entity} · {log.category} · {new Date(log.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
