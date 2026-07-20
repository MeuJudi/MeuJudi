import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn } from "../../../(auth)/actions";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorMessages: Record<string, string> = {
    email_not_confirmed: "Confirme o email desta conta antes de acessar o painel.",
    admin_required: "Esta conta nao tem permissao de Super Admin.",
    admin_profile_missing: "O perfil administrativo nao foi encontrado.",
    "Invalid login credentials": "Email ou senha incorretos.",
  };
  const errorKey = params.error ? decodeURIComponent(params.error) : null;
  const errorMessage = errorKey ? (errorMessages[errorKey] ?? "Nao foi possivel entrar. Tente novamente.") : null;

  return (
    <Card className="auth-card auth-admin-card">
        <CardHeader className="auth-card-header">
          <CardTitle>Entrar no Super Admin</CardTitle>
          <CardDescription>Acesso reservado para gestao global da plataforma SaaS.</CardDescription>
        </CardHeader>
        <CardContent className="auth-card-content">
          {errorMessage ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}
          <form action={signIn} className="space-y-4">
            <input type="hidden" name="redirect_to" value="/admin" />
            <div className="space-y-2">
              <Label htmlFor="email">Email de administrador</Label>
              <div className="auth-admin-input-wrap">
                <Mail className="auth-admin-input-icon" />
                <Input id="email" name="email" type="email" autoComplete="username" placeholder="seu@email.com" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <PasswordInput id="password" name="password" autoComplete="current-password" required />
            </div>
            <Button className="auth-primary-button w-full" type="submit">
              <ShieldCheck className="h-4 w-4" />
              Entrar no Super Admin
            </Button>
          </form>
          <p className="auth-admin-product-link">
            <ArrowRight className="h-4 w-4" />
            <Link className="font-medium text-primary" href="/login">
              Entrar no produto
            </Link>
          </p>
        </CardContent>
    </Card>
  );
}
