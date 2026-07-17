import Link from "next/link";
import { LogIn } from "lucide-react";
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
    <Card>
      <CardHeader>
        <CardTitle>Entrar no MeuJudi</CardTitle>
        <CardDescription>Acesse o painel do seu escritorio.</CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <form action={signIn} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" placeholder="voce@escritorio.com.br" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Senha</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                Esqueci minha senha
              </Link>
            </div>
            <PasswordInput id="password" name="password" />
          </div>
          <Button className="w-full" type="submit">
            <LogIn className="h-4 w-4" />
            Entrar
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ainda nao tem conta?{" "}
          <Link className="font-medium text-primary" href="/register">
            Criar conta
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
