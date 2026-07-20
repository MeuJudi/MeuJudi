"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, ArrowLeft, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validSession, setValidSession] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setValidSession(!!session);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      setError("A senha deve ter pelo menos 8 caracteres.");
      setLoading(false);
      return;
    }

    if (password !== passwordConfirmation) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError("Erro ao redefinir senha. Tente novamente.");
      setLoading(false);
      return;
    }

    setSuccess(true);
    setLoading(false);

    setTimeout(() => {
      router.push("/login");
    }, 3000);
  }

  if (validSession === null) {
    return (
      <Card className="auth-card auth-reset-card">
        <CardContent className="auth-card-content pt-6 text-center text-muted-foreground">Carregando...</CardContent>
      </Card>
    );
  }

  if (!validSession) {
    return (
      <Card className="auth-card auth-reset-card">
        <CardHeader className="auth-card-header">
          <CardTitle>Link inválido ou expirado</CardTitle>
          <CardDescription>
            O link de redefinição de senha não é válido ou já expirou.
          </CardDescription>
        </CardHeader>
        <CardContent className="auth-card-content">
          <Button asChild variant="outline" className="w-full">
            <Link href="/forgot-password">
              <ArrowLeft className="h-4 w-4" />
              Solicitar novo link
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="auth-card auth-reset-card">
        <CardHeader className="auth-card-header">
          <CardTitle>Senha redefinida!</CardTitle>
          <CardDescription>Sua senha foi alterada com sucesso.</CardDescription>
        </CardHeader>
        <CardContent className="auth-card-content space-y-4">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
            <CheckCircle className="h-4 w-4 text-green-600" />
            Redirecionando para o login...
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Ir para o login agora</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
      <Card className="auth-card auth-reset-card">
      <CardHeader className="auth-card-header">
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>Crie uma nova senha para voltar ao seu escritório.</CardDescription>
      </CardHeader>
      <CardContent className="auth-card-content">
        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Nova senha</Label>
            <div className="auth-reset-input-wrap">
              <Lock className="auth-reset-input-icon" />
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <p className="auth-reset-hint">Use pelo menos 8 caracteres.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password_confirmation">Confirmar nova senha</Label>
            <div className="auth-reset-input-wrap">
              <Lock className="auth-reset-input-icon" />
              <PasswordInput
                id="password_confirmation"
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                minLength={8}
                required
              />
            </div>
          </div>
          <Button className="auth-primary-button w-full" type="submit" disabled={loading}>
            {loading ? (
              "Redefinindo..."
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Redefinir senha
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
