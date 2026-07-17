import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUp } from "../actions";

const errorMessages: Record<string, string> = {
  terms_required: "Voce precisa aceitar os termos de uso.",
  "User already registered": "Este email ja esta cadastrado.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const errorKey = params.error ? decodeURIComponent(params.error) : null;
  const errorMessage = errorKey ? (errorMessages[errorKey] ?? "Erro ao criar conta. Tente novamente.") : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          Configure seu escritorio ou peça acesso a um escritorio existente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
        <form action={signUp} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="office">Nome do escritorio</Label>
              <Input id="office" name="office" placeholder="Ex: Silva Advocacia" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Seu nome</Label>
              <Input id="name" name="name" placeholder="Nome completo" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="voce@escritorio.com.br" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" name="password" type="password" minLength={8} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oab">OAB</Label>
              <Input id="oab" name="oab" placeholder="67553" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="uf">UF</Label>
              <Input id="uf" name="uf" placeholder="PR" maxLength={2} />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
            <input className="mt-1" type="checkbox" name="terms" required />
            <span>
              Aceito os termos de uso e a politica de privacidade do MeuJudi.
            </span>
          </label>

          <Button className="w-full" type="submit">
            Continuar configuracao
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
        <div className="mt-6 rounded-md border border-border p-3 text-sm text-muted-foreground">
          Ja existe um escritorio? Cadastre seu email e envie para o socio responsavel.
          Quando ele convidar esse email, seu acesso entra direto no escritorio.
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Ja tem conta?{" "}
          <Link className="font-medium text-primary" href="/login">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
