"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signUp } from "../actions";

export function RegisterForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isPending, startTransition] = useTransition();

  const passwordMismatch = confirmation.length > 0 && password !== confirmation;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const canSubmit = termsAccepted && !passwordMismatch && !passwordTooShort && password.length > 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await signUp(formData);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="office">Nome do escritorio</Label><Input id="office" name="office" placeholder="Ex: Silva Advocacia" /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="name">Seu nome</Label><Input id="name" name="name" placeholder="Nome completo" required /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" placeholder="voce@escritorio.com.br" required /></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="password">Senha</Label><PasswordInput id="password" name="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="password_confirmation">Confirmar senha</Label>
          <PasswordInput id="password_confirmation" name="password_confirmation" minLength={8} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required aria-invalid={passwordMismatch} />
          {passwordTooShort ? <p className="text-xs text-destructive">A senha precisa ter pelo menos 8 caracteres.</p> : null}
          {passwordMismatch ? <p className="text-xs text-destructive">As senhas não coincidem.</p> : confirmation.length > 0 ? <p className="flex items-center gap-1 text-xs text-[var(--tenant-moss,#4b6b4e)]"><CheckCircle2 className="h-3.5 w-3.5" /> Senhas compatíveis.</p> : null}
        </div>
        <div className="space-y-2"><Label htmlFor="oab">OAB</Label><Input id="oab" name="oab" placeholder="67553" inputMode="numeric" pattern="[0-9]*" /></div>
        <div className="space-y-2"><Label htmlFor="uf">UF</Label><Input id="uf" name="uf" placeholder="PR" maxLength={2} /></div>
      </div>

      <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
        <input className="mt-1" type="checkbox" name="terms" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} />
        <span>Aceito os <Link href="/termos" target="_blank" className="font-medium text-primary underline">termos de uso</Link> e a <Link href="/privacidade" target="_blank" className="font-medium text-primary underline">politica de privacidade</Link> do MeuJudi.</span>
      </label>

      <Button className="w-full" type="submit" disabled={!canSubmit || isPending}>
        {isPending ? "Enviando codigo..." : "Continuar configuracao"}
        <ArrowRight className="h-4 w-4" />
      </Button>
      {!termsAccepted ? <p className="text-center text-xs text-muted-foreground">Aceite os termos para continuar.</p> : null}
    </form>
  );
}
