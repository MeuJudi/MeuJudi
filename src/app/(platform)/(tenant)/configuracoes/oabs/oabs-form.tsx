"use client";

import { useState, useTransition } from "react";
import { Loader2, Star, Trash2, ShieldCheck } from "lucide-react";
import { addOab, removeOab, setPrimaryOab } from "../actions";
import { maskOab } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { OabValidationCard } from "./oab-validation-card";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

type Oab = {
  id: string;
  oab_number: string;
  oab_uf: string;
  is_primary: boolean;
  user_name: string | null;
};

type Props = {
  oabs: Oab[];
  currentUserName: string;
  currentUserOabNumber?: string;
  currentUserOabUf?: string;
};

export function OabsForm({ oabs, currentUserName, currentUserOabNumber, currentUserOabUf }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [oabNumber, setOabNumber] = useState("");
  const [oabUf, setOabUf] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("oab_number", oabNumber);
    formData.set("oab_uf", oabUf);

    startTransition(async () => {
      try {
        await addOab(formData);
        setOabNumber("");
        setOabUf("");
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao adicionar OAB.");
      }
    });
  }

  function handleRemove(id: string) {
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        await removeOab(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao remover OAB.");
      }
    });
  }

  function handleSetPrimary(id: string) {
    setError(null);

    startTransition(async () => {
      try {
        await setPrimaryOab(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao definir principal.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
          OABs do escritório
        </h2>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          Cadastre aqui apenas a inscrição institucional do escritório. A OAB pessoal de cada pessoa fica no perfil dela.
        </p>
      </div>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--tenant-brass)]" />
            <h3 className="font-semibold">Validação oficial OAB</h3>
          </div>
          <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
            Consulte a base da OAB para confirmar que os dados do advogado estão corretos.
          </p>
          <OabValidationCard
            initialNumber={currentUserOabNumber}
            initialUf={currentUserOabUf}
            userName={currentUserName}
          />
        </CardContent>
      </Card>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-6">
          {error && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
              Operação realizada com sucesso!
            </div>
          )}

          <form onSubmit={handleAdd} className="mb-6 flex gap-3">
            <div className="flex-1">
              <Input
                value={oabNumber}
                onChange={(e) => setOabNumber(maskOab(e.target.value))}
                placeholder="Número da OAB"
                inputMode="numeric"
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
              />
            </div>
            <div className="w-24">
              <select
                value={oabUf}
                onChange={(e) => setOabUf(e.target.value)}
                className="flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-1 text-sm text-[var(--color-card-foreground)] shadow-sm transition-colors placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--tenant-brass)]"
              >
                <option value="">UF</option>
                {ufs.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={isPending || !oabNumber || !oabUf}
              className="bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "+ Adicionar"}
            </Button>
          </form>

          {oabs.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">Nenhuma OAB vinculada ao escritório.</p>
          ) : (
            <div className="divide-y rounded-md border border-[var(--tenant-line)]">
              {oabs.map((oab) => (
                <div key={oab.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-[var(--color-card-foreground)]">
                      OAB {oab.oab_number}/{oab.oab_uf}
                    </span>
                    {oab.is_primary && (
                      <Badge
                        variant="outline"
                        className="border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_10%,transparent)] text-[var(--tenant-brass)]"
                      >
                        <Star className="mr-1 h-3 w-3" />
                        Principal
                      </Badge>
                    )}
                    {oab.user_name && (
                      <span className="text-sm text-[var(--color-muted-foreground)]">
                        — {oab.user_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!oab.is_primary && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSetPrimary(oab.id)}
                        disabled={isPending}
                        className="text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]"
                      >
                        Definir como principal
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(oab.id)}
                      disabled={isPending}
                      className="text-[var(--color-muted-foreground)] hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
