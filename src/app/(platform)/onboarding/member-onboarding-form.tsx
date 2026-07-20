"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";
import { completeMemberOnboarding } from "./actions";
import { maskOab, maskPhone, stripMask } from "@/lib/masks";
import { roleLabel, type Gender } from "@/lib/auth/labels";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { tenantName: string; role: string };

export function MemberOnboardingForm({ tenantName, role }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [oabNumber, setOabNumber] = useState("");
  const [oabUf, setOabUf] = useState("");
  const [gender, setGender] = useState<Gender>("neutral");
  const [error, setError] = useState<string | null>(null);
  const isLawyer = role === "lawyer";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError("Informe seu nome."); return; }
    setError(null);
    const data = new FormData();
    data.set("name", name); data.set("phone", stripMask(phone)); data.set("oab_number", stripMask(oabNumber)); data.set("oab_uf", oabUf); data.set("gender", gender);
    startTransition(async () => {
      const result = await completeMemberOnboarding(data);
      if (!result.success) { setError(result.error ?? "Não foi possível aceitar o convite."); return; }
      router.push("/monitoramento");
    });
  }

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-8 sm:p-10">
        <div className="mb-6 rounded-lg bg-[var(--tenant-surface-muted)] p-4">
          <p className="text-xs font-medium text-[var(--color-muted-foreground)]">Convite encontrado</p>
          <p className="mt-1 text-lg font-semibold text-[var(--tenant-surface-foreground)]">{tenantName}</p>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">Você entrará como {roleLabel(role, gender)}.</p>
        </div>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {error ? <div className="sm:col-span-2 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div> : null}
          <div className="space-y-2 sm:col-span-2"><Label htmlFor="member_name">Seu nome *</Label><Input id="member_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" required /></div>
          <div className="space-y-2"><Label htmlFor="member_phone">Telefone</Label><Input id="member_phone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" /></div>
          <div className="space-y-2"><Label htmlFor="member_gender">Sexo</Label><select id="member_gender" value={gender} onChange={(e) => setGender(e.target.value as Gender)} className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 text-sm text-[var(--tenant-surface-foreground)]"><option value="feminine">Feminino</option><option value="masculine">Masculino</option><option value="neutral">Prefiro não informar</option></select></div>
          {isLawyer ? <>
            <div className="space-y-2"><Label htmlFor="member_oab">Sua OAB</Label><Input id="member_oab" value={oabNumber} onChange={(e) => setOabNumber(maskOab(e.target.value))} placeholder="Número da OAB" inputMode="numeric" /></div>
            <div className="space-y-2"><Label htmlFor="member_oab_uf">UF da OAB</Label><select id="member_oab_uf" value={oabUf} onChange={(e) => setOabUf(e.target.value)} className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 text-sm text-[var(--tenant-surface-foreground)]"><option value="">UF</option>{["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"].map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></div>
          </> : null}
          <Button className="sm:col-span-2" type="submit" disabled={isPending}>{isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Vinculando...</> : <>Continuar <ArrowRight className="h-4 w-4" /></>}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
