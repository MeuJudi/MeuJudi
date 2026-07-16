import { MailPlus, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireOwner } from "@/lib/auth/guards";
import { createInvite } from "./actions";

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const { supabase, profile } = await requireOwner();
  const [{ data: users }, { data: invites }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, email, role, is_active, created_at")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tenant_invites")
      .select("id, email, role, status, expires_at, created_at")
      .eq("tenant_id", profile.tenant_id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header>
          <p className="text-sm font-medium text-primary">Escritório</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Equipe e convites</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            O owner gerencia quem pode entrar no tenant. Convites pendentes vinculam o email ao
            escritório no cadastro.
          </p>
        </header>

        {params.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {params.error}
          </div>
        ) : null}
        {params.success ? (
          <div className="rounded-md border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
            Convite registrado.
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <MailPlus className="h-5 w-5 text-primary" />
              <CardTitle>Novo convite</CardTitle>
            </CardHeader>
            <CardContent>
              <form action={createInvite} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Papel</Label>
                  <select
                    id="role"
                    name="role"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue="lawyer"
                  >
                    <option value="lawyer">Advogado</option>
                    <option value="staff">Equipe</option>
                    <option value="owner">Sócio/owner</option>
                  </select>
                </div>
                <Button type="submit">Criar convite</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Users className="h-5 w-5 text-primary" />
              <CardTitle>Membros</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {users?.map((user) => (
                <div key={user.id} className="flex items-center justify-between border-b pb-3 last:border-0">
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                  <Badge variant="outline">{user.role}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Convites pendentes e recentes</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b text-left text-muted-foreground">
                <tr>
                  <th className="py-3 pr-4 font-medium">Email</th>
                  <th className="py-3 pr-4 font-medium">Papel</th>
                  <th className="py-3 pr-4 font-medium">Status</th>
                  <th className="py-3 pr-4 font-medium">Expira</th>
                </tr>
              </thead>
              <tbody>
                {invites?.map((invite) => (
                  <tr key={invite.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">{invite.email}</td>
                    <td className="py-3 pr-4">{invite.role}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="outline">{invite.status}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {new Date(invite.expires_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
