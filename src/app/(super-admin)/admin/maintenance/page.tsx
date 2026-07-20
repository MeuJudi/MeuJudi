import { CalendarClock, Globe2, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { cancelMaintenanceWindow, createMaintenanceWindow } from "../actions";

export default async function AdminMaintenancePage() {
  const { supabase } = await requireSuperAdmin();
  const [{ data: tenants }, { data: windows }] = await Promise.all([
    supabase.from("tenants").select("id, name").order("name"),
    supabase.from("maintenance_windows").select("id, scope, tenant_id, title, message, starts_at, ends_at, status, tenants(name)").order("starts_at", { ascending: false }).limit(30),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <p className="text-sm font-medium text-primary">Super Admin</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Janelas de manutenção</h1>
        <p className="mt-2 text-sm text-muted-foreground">Programe uma interrupção para um escritório ou para toda a plataforma. O acesso de suporte continua separado dessa função.</p>
      </header>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5 text-primary" /> Nova janela</CardTitle></CardHeader>
        <CardContent>
          <form action={createMaintenanceWindow} className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium">Aplicar em
              <select name="scope" defaultValue="tenant" className="mt-1 w-full rounded-md border bg-background px-3 py-2">
                <option value="tenant">Um tenant</option><option value="platform">Toda a plataforma</option>
              </select>
            </label>
            <label className="text-sm font-medium">Tenant
              <select name="tenant_id" className="mt-1 w-full rounded-md border bg-background px-3 py-2">
                <option value="">Selecione um tenant</option>
                {tenants?.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">Título<input name="title" defaultValue="Janela de manutenção" className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm font-medium">Modo
              <select name="mode" defaultValue="schedule" className="mt-1 w-full rounded-md border bg-background px-3 py-2"><option value="schedule">Programar</option><option value="now">Começar agora</option></select>
            </label>
            <label className="text-sm font-medium md:col-span-2">Mensagem para os usuários<textarea name="message" required defaultValue="O sistema ficará temporariamente indisponível para uma atualização." className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm font-medium">Início<input type="date" name="start_date" required className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm font-medium">Horário de início<input type="time" name="start_time" defaultValue="22:00" required className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm font-medium">Fim<input type="date" name="end_date" required className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
            <label className="text-sm font-medium">Horário de fim<input type="time" name="end_time" defaultValue="23:00" required className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label>
            <div className="md:col-span-2"><Button type="submit">Salvar janela</Button></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><CalendarClock className="h-5 w-5 text-primary" /> Histórico e agenda</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {windows?.map((window) => {
            const tenant = Array.isArray(window.tenants) ? window.tenants[0] : window.tenants;
            return <div key={window.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
              <div><div className="flex items-center gap-2 font-medium">{window.scope === "platform" ? <Globe2 className="h-4 w-4" /> : null}{window.title}<Badge variant="outline">{window.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{window.scope === "platform" ? "Toda a plataforma" : tenant?.name ?? "Tenant"} · {new Date(window.starts_at).toLocaleString("pt-BR")} até {new Date(window.ends_at).toLocaleString("pt-BR")}</p><p className="mt-1 text-sm text-muted-foreground">{window.message}</p></div>
              {window.status !== "cancelled" && <form action={cancelMaintenanceWindow}><input type="hidden" name="id" value={window.id} /><Button type="submit" variant="outline">Cancelar</Button></form>}
            </div>;
          })}
          {!windows?.length && <p className="text-sm text-muted-foreground">Nenhuma janela cadastrada.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
