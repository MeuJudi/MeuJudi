import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "./register-form";

const errorMessages: Record<string, string> = {
  terms_required: "Voce precisa aceitar os termos de uso.",
  "User already registered": "Este email ja esta cadastrado.",
  password_mismatch: "As senhas nao coincidem.",
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
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <RegisterForm />
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
