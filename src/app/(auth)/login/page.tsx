import Link from "next/link";
import { Lock, LogIn, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signIn } from "../actions";

const errorMessages: Record<string, string> = {
  "Invalid login credentials": "Email ou senha incorretos.",
  "Email not confirmed": "Confirme seu email antes de entrar.",
  auth_callback_failed: "Erro ao autenticar. Tente novamente.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorKey = params.error ? decodeURIComponent(params.error) : null;
  const errorMessage = errorKey ? (errorMessages[errorKey] ?? "Erro ao entrar. Tente novamente.") : null;

  return (
    <Card className="auth-card auth-login-card">
      <CardHeader className="auth-card-header">
        <CardTitle>Entrar no MeuJudi</CardTitle>
          <CardDescription>Acesse o painel do seu escritório.</CardDescription>
      </CardHeader>
      <CardContent className="auth-card-content">
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <form action={signIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="auth-login-input-wrap">
              <Mail className="auth-login-input-icon" />
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="seu@email.com.br" required />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                Esqueci minha senha
              </Link>
            </div>
            <div className="auth-login-input-wrap">
              <Lock className="auth-login-input-icon" />
              <PasswordInput id="password" name="password" />
            </div>
          </div>
          <Button className="auth-primary-button w-full" type="submit">
            <LogIn className="h-4 w-4" />
            Entrar
          </Button>
        </form>
        <div className="auth-login-divider"><span>ou</span></div>
        <div className="auth-login-footer">
          <span>Ainda não tem uma conta?</span>{" "}
          <Link className="font-medium text-primary" href="/register">
            Criar conta
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
