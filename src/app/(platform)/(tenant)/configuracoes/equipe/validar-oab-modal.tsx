"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { maskOab } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

type Props = {
  memberName: string;
  memberOabNumber: string | null;
  memberOabUf: string | null;
  onSubmit: (data: { oab_number: string; oab_uf: string; professional_email: string; requester_name: string }) => Promise<void>;
  onClose: () => void;
};

export function ValidarOabModal({ memberName, memberOabNumber, memberOabUf, onSubmit, onClose }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [oabNumber, setOabNumber] = useState(memberOabNumber ?? "");
  const [oabUf, setOabUf] = useState(memberOabUf ?? "");
  const [professionalEmail, setProfessionalEmail] = useState("");
  const [requesterName, setRequesterName] = useState(memberName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await onSubmit({ oab_number: oabNumber, oab_uf: oabUf, professional_email: professionalEmail, requester_name: requesterName });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao iniciar validação.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-md rounded-xl border border-[var(--tenant-line)] bg-[var(--tenant-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--tenant-line)] px-6 py-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--tenant-brass)]" />
            <h3 className="font-semibold text-[var(--color-card-foreground)]">Validar OAB</h3>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-card-foreground)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Preencha os dados da OAB de <strong>{memberName}</strong> para iniciar a validação pelo ConfirmADV.
          </p>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="voab_number">Número da OAB</Label>
              <Input
                id="voab_number"
                value={oabNumber}
                onChange={(e) => setOabNumber(maskOab(e.target.value))}
                placeholder="Ex: 123456"
                inputMode="numeric"
                required
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="voab_uf">UF</Label>
              <select
                id="voab_uf"
                value={oabUf}
                onChange={(e) => setOabUf(e.target.value)}
                required
                className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-1 text-sm text-[var(--color-card-foreground)] shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tenant-brass)]"
              >
                <option value="">UF</option>
                {ufs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voab_email">E-mail profissional cadastrado na OAB</Label>
            <Input
              id="voab_email"
              type="email"
              value={professionalEmail}
              onChange={(e) => setProfessionalEmail(e.target.value)}
              placeholder="email@exemplo.com"
              required
              className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="voab_name">Nome do solicitante</Label>
            <Input
              id="voab_name"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Nome completo"
              required
              className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-[var(--tenant-line)] text-[var(--color-card-foreground)]"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending || !oabNumber || !oabUf || !professionalEmail || !requesterName}
              className="flex-1 bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
            >
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Iniciar validação
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
