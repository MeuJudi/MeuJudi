"use client";

// Fase 2 (tela Web) — mesmo molde de configuracoes/oabs/oabs-form.tsx
// (useState por campo, useTransition, FormData manual).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { maskOab } from "@/lib/masks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarOuRetomarSolicitacaoValidacao } from "./actions";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

interface ValidacaoFormProps {
  defaultOabNumber: string;
  defaultOabUf: string;
  defaultRequesterName: string;
  // S5: prop opcional com a última validação (positiva) do usuário.
  // Quando presente, mostramos um aviso amigável no topo do form.
  ultimaValidacao?: {
    verifiedAt: string;
    oabNumber: string;
    oabUf: string;
  } | null;
}

function formatarDataCurta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ValidacaoForm({ defaultOabNumber, defaultOabUf, defaultRequesterName, ultimaValidacao }: ValidacaoFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [oabNumber, setOabNumber] = useState(defaultOabNumber);
  const [oabUf, setOabUf] = useState(defaultOabUf);
  const [professionalEmail, setProfessionalEmail] = useState("");
  const [requesterName, setRequesterName] = useState(defaultRequesterName);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const formData = new FormData();
    formData.set("oab_number", oabNumber);
    formData.set("oab_uf", oabUf);
    formData.set("professional_email", professionalEmail);
    formData.set("requester_name", requesterName);

    startTransition(async () => {
      try {
        await criarOuRetomarSolicitacaoValidacao(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao registrar a solicitação.");
      }
    });
  }

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="p-6">
        <h3 className="mb-1 font-semibold">Dados profissionais</h3>
        <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
          O e-mail informado precisa ser o e-mail profissional cadastrado na OAB — ele pode ser
          diferente do e-mail usado para entrar no MeuJudi.
        </p>

        {ultimaValidacao ? (
          // S5: mostra a última validação positiva. Reduz fricção e educa
          // o usuário — se nada mudou, ele não precisa validar de novo.
          <div className="mb-4 flex items-start gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                Última validação: {formatarDataCurta(ultimaValidacao.verifiedAt)} — OAB{" "}
                {ultimaValidacao.oabNumber}/{ultimaValidacao.oabUf}
              </p>
              <p className="mt-0.5 text-green-800">
                Se seus dados profissionais não mudaram, você não precisa validar de novo.
              </p>
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="oab_number">Número da OAB</Label>
              <Input
                id="oab_number"
                value={oabNumber}
                onChange={(e) => setOabNumber(maskOab(e.target.value))}
                placeholder="Número da OAB"
                inputMode="numeric"
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="oab_uf">UF</Label>
              <select
                id="oab_uf"
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
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="professional_email">E-mail profissional cadastrado na OAB</Label>
            <Input
              id="professional_email"
              type="email"
              value={professionalEmail}
              onChange={(e) => setProfessionalEmail(e.target.value)}
              placeholder="seu@email-profissional.com"
              className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="requester_name">Nome do solicitante</Label>
            <Input
              id="requester_name"
              value={requesterName}
              onChange={(e) => setRequesterName(e.target.value)}
              placeholder="Nome de quem está solicitando a verificação"
              className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || !oabNumber || !oabUf || !professionalEmail || !requesterName}
            className="bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Iniciar validação
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
