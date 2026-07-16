import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";

export default async function AdminAuditPage() {
  const { supabase } = await requireSuperAdmin();
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, tenant_id, user_id, action, entity, category, severity, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Auditoria global</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Últimos eventos sensíveis registrados no SaaS.
        </p>
      </header>

      <Card>
        <CardHeader>
          <ClipboardList className="h-5 w-5 text-primary" />
          <CardTitle>Eventos</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b text-left text-muted-foreground">
              <tr>
                <th className="py-3 pr-4 font-medium">Quando</th>
                <th className="py-3 pr-4 font-medium">Ação</th>
                <th className="py-3 pr-4 font-medium">Entidade</th>
                <th className="py-3 pr-4 font-medium">Categoria</th>
                <th className="py-3 pr-4 font-medium">Tenant</th>
              </tr>
            </thead>
            <tbody>
              {logs?.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="py-3 pr-4 text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{log.action}</td>
                  <td className="py-3 pr-4">{log.entity}</td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{log.category}</Badge>
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                    {log.tenant_id ?? "-"}
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
