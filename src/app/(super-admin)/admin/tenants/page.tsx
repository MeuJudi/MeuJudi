import Link from "next/link";
import { Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { setTenantStatus } from "../actions";

export default async function AdminTenantsPage() {
  const { supabase } = await requireSuperAdmin();
  const { data: tenants, error } = await supabase
    .from("tenants")
    .select("id, name, slug, city, state, is_active, is_free_mvp, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Clientes</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Clientes conectados as verticais da plataforma.
        </p>
      </header>

      <Card>
        <CardHeader>
          <Building2 className="h-5 w-5 text-primary" />
          <CardTitle>Lista de clientes</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-3 pr-4 font-medium">Nome</th>
                <th className="py-3 pr-4 font-medium">Slug</th>
                <th className="py-3 pr-4 font-medium">Cidade</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Modelo</th>
                <th className="py-3 pr-4 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {tenants?.map((tenant) => (
                <tr key={tenant.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">
                    <Link href={`/admin/tenants/${tenant.id}`} className="hover:underline">
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{tenant.slug}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {[tenant.city, tenant.state].filter(Boolean).join(" / ") || "-"}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant={tenant.is_active ? "default" : "secondary"}>
                      {tenant.is_active ? "Ativo" : "Suspenso"}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{tenant.is_free_mvp ? "MVP gratuito" : "Pago"}</Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <form action={setTenantStatus}>
                      <input type="hidden" name="tenant_id" value={tenant.id} />
                      <input type="hidden" name="is_active" value={String(!tenant.is_active)} />
                      <Button type="submit" size="sm" variant="outline">
                        {tenant.is_active ? "Suspender" : "Reativar"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
