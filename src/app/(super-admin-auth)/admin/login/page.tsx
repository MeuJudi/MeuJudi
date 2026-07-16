import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signIn } from "../../../(auth)/actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Shield className="h-6 w-6 text-primary" />
          <CardTitle>Acesso Super Admin</CardTitle>
          <CardDescription>Entrada separada para administração global do SaaS.</CardDescription>
        </CardHeader>
        <CardContent>
          {params.error ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {params.error}
            </div>
          ) : null}
          <form action={signIn} className="space-y-4">
            <input type="hidden" name="redirect_to" value="/admin" />
            <div className="space-y-2">
              <Label htmlFor="email">Email administrativo</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button className="w-full" type="submit">
              <Shield className="h-4 w-4" />
              Entrar no admin
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Acesso de escritório?{" "}
            <Link className="font-medium text-primary" href="/login">
              Entrar no painel comum
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
