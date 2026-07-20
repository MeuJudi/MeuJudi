"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password`,
    });

    if (resetError) {
      setError("Erro ao enviar email. Verifique o email e tente novamente.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <Card className="auth-card auth-forgot-card">
        <CardHeader className="auth-card-header">
          <CardTitle>Email enviado</CardTitle>
          <CardDescription>
            Verifique sua caixa de entrada e clique no link para redefinir sua senha.
          </CardDescription>
        </CardHeader>
        <CardContent className="auth-card-content space-y-4">
          <div className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            Se o email <strong>{email}</strong> estiver cadastrado, você receberá um link para
            redefinir sua senha em breve.
          </div>
          <Button asChild variant="outline" className="auth-forgot-secondary w-full">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
              Voltar para o login
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="auth-card auth-forgot-card">
      <CardHeader className="auth-card-header">
        <CardTitle>Recuperar acesso</CardTitle>
        <CardDescription>Enviaremos um link para redefinir sua senha.</CardDescription>
      </CardHeader>
      <CardContent className="auth-card-content">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="auth-forgot-input-wrap">
              <Mail className="auth-forgot-input-icon" />
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>
          <Button className="auth-primary-button w-full" type="submit" disabled={loading}>
            {loading ? (
              "Enviando..."
            ) : (
              <>
                <Send className="h-4 w-4" />
                Enviar link de redefinição
              </>
            )}
          </Button>
        </form>
        <p className="auth-forgot-footer">
          Lembrou a senha?{" "}
          <Link className="font-medium text-primary" href="/login">
            Voltar para o login
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
