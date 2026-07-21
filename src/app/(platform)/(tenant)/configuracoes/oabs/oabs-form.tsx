"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { addOab } from "../actions";
import { maskOab } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

export function OabsForm() {
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

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-6">
        <h3 className="mb-3 font-semibold">Adicionar OAB do escritório</h3>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
            OAB adicionada. Clique em <strong>Validar OAB</strong> para
            confirmar a situação na base oficial.
          </div>
        )}

        <form onSubmit={handleAdd} className="flex gap-3">
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
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
