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
    <Card className="auth-card auth-register-card">
      <CardHeader className="auth-card-header">
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>
          Configure seu escritorio ou peça acesso a um escritorio existente.
        </CardDescription>
        <div className="auth-register-steps" aria-label="Etapas do cadastro">
          <span className="is-active"><b>1</b> Cadastro</span>
          <i />
          <span><b>2</b> Confirmação</span>
          <i />
          <span><b>3</b> Configuração</span>
        </div>
      </CardHeader>
      <CardContent className="auth-card-content">
        {errorMessage ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}
        <RegisterForm />
        <div className="auth-register-note">
          <strong>Já existe um escritório?</strong>
          <span>Cadastre seu email e envie para o sócio responsável. Quando ele convidar esse email, seu acesso entra direto no escritório.</span>
        </div>
        <p className="auth-register-footer">
          Já tem conta?{" "}
          <Link className="font-medium text-primary" href="/login">
            Entrar
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
