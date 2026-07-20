"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendSignupCode, verifySignupCode } from "../../actions";

export function ConfirmSignupForm({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <div className="space-y-4">
      <form action={(formData) => startTransition(() => verifySignupCode(formData))} className="space-y-3">
        <input type="hidden" name="email" value={email} />
        <Label htmlFor="token">Codigo de confirmacao</Label>
        <Input id="token" name="token" inputMode="numeric" pattern="[0-9]{6,8}" maxLength={8} placeholder="00000000" className="text-center font-mono text-xl tracking-[0.35em]" required />
        <Button className="w-full" type="submit" disabled={isPending || !email}>{isPending ? "Confirmando..." : "Confirmar email"}</Button>
      </form>
      <form action={(formData) => startTransition(() => resendSignupCode(formData))}>
        <input type="hidden" name="email" value={email} />
        <Button variant="outline" className="w-full" type="submit" disabled={isPending || !email}>Reenviar codigo</Button>
      </form>
    </div>
  );
}
