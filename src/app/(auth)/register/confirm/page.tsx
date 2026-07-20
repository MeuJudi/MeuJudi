import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSignupForm } from "./confirm-signup-form";

export default async function ConfirmSignupPage({ searchParams }: { searchParams: Promise<{ email?: string; error?: string; resent?: string }> }) {
  const params = await searchParams;
  const email = params.email ?? "";
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><MailCheck className="h-6 w-6" /></div>
        <CardTitle>Confirme seu email</CardTitle>
        <CardDescription>Enviamos um codigo de confirmacao para <strong>{email}</strong>.</CardDescription>
      </CardHeader>
      <CardContent>
        {params.error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {params.error === "email_not_confirmed" ? "Seu email ainda não foi confirmado. Informe o código recebido ou solicite um novo." : "Código inválido ou expirado. Tente novamente."}
        </div> : null}
        {params.resent ? <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">Um novo codigo foi enviado.</div> : null}
        <ConfirmSignupForm email={email} />
        <p className="mt-6 text-center text-sm text-muted-foreground"><Link href="/login" className="font-medium text-primary">Voltar para entrar</Link></p>
      </CardContent>
    </Card>
  );
}
