"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldX, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { maskOab } from "@/lib/masks";
import { validarOab } from "./actions-validacao";
import { cn } from "@/lib/utils";

const ufs = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
  "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC",
  "SP","SE","TO",
];

type Resultado = {
  nome: string;
  inscricao: string;
  uf: string;
  situacao: string;
  tipo: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone?: string;
  email?: string;
};

function statusTone(situacao: string): "ok" | "warn" | "bad" {
  const s = situacao.toUpperCase();
  if (s.includes("ATIV") || s.includes("REGULAR") || s.includes("INSCRITO")) {
    return "ok";
  }
  if (s.includes("SUSPENS") || s.includes("BAIXAD") || s.includes("CANCELAD")) {
    return "bad";
  }
  return "warn";
}

export function OabValidationCard({
  initialNumber,
  initialUf,
  userName,
}: {
  initialNumber?: string;
  initialUf?: string;
  userName: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [oabNumber, setOabNumber] = useState(initialNumber ?? "");
  const [oabUf, setOabUf] = useState(initialUf ?? "");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  function handleValidar() {
    if (!oabNumber || !oabUf) return;
    setError(null);
    setResultado(null);
    startTransition(async () => {
      try {
        const result = await validarOab({
          oab_number: oabNumber,
          oab_uf: oabUf,
        });
        if (!result) {
          setError("OAB não encontrada na base oficial.");
          setLastChecked(new Date());
          return;
        }
        setResultado(result as Resultado);
        setLastChecked(new Date());
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Erro ao validar OAB."
        );
      }
    });
  }

  const tone = resultado ? statusTone(resultado.situacao) : null;
  const matchesName = resultado
    ? normalizar(resultado.nome) === normalizar(userName)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
            Número da OAB
          </label>
          <Input
            value={oabNumber}
            onChange={(e) => setOabNumber(maskOab(e.target.value))}
            placeholder="000000"
            inputMode="numeric"
            className="mt-1 border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--color-card-foreground)]"
          />
        </div>
        <div className="w-24">
          <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
            UF
          </label>
          <select
            value={oabUf}
            onChange={(e) => setOabUf(e.target.value)}
            className="mt-1 flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 text-sm text-[var(--color-card-foreground)]"
          >
            <option value="">UF</option>
            {ufs.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleValidar}
          disabled={isPending || !oabNumber || !oabUf}
          className="bg-[var(--tenant-brass)] text-white"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          Validar OAB
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <ShieldX className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {resultado && tone && (
        <div
          className={cn(
            "rounded-md border px-4 py-3",
            tone === "ok" && "border-green-300 bg-green-50",
            tone === "warn" && "border-amber-300 bg-amber-50",
            tone === "bad" && "border-red-300 bg-red-50"
          )}
        >
          <div className="flex items-start gap-3">
            {tone === "ok" ? (
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-700" />
            ) : tone === "bad" ? (
              <ShieldX className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            )}
            <div className="flex-1 space-y-2">
              <div>
                <p
                  className={cn(
                    "font-semibold",
                    tone === "ok" && "text-green-800",
                    tone === "warn" && "text-amber-800",
                    tone === "bad" && "text-red-800"
                  )}
                >
                  OAB {resultado.inscricao}/{resultado.uf} — {resultado.nome}
                </p>
                <p
                  className={cn(
                    "text-sm",
                    tone === "ok" && "text-green-700",
                    tone === "warn" && "text-amber-700",
                    tone === "bad" && "text-red-700"
                  )}
                >
                  Situação: {resultado.situacao}
                  {resultado.tipo ? ` · ${resultado.tipo}` : ""}
                </p>
              </div>

              {matchesName === false && (
                <p className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-xs text-amber-900">
                  Atenção: o nome na OAB ({resultado.nome}) não confere com o do
                  perfil ({userName}). Verifique se a OAB é realmente sua.
                </p>
              )}

              {(resultado.endereco || resultado.cidade || resultado.telefone) && (
                <div className="space-y-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {resultado.endereco && <p>Endereço: {resultado.endereco}</p>}
                  {resultado.cidade && (
                    <p>
                      {resultado.cidade}
                      {resultado.estado ? `/${resultado.estado}` : ""}{" "}
                      {resultado.cep ? `· CEP ${resultado.cep}` : ""}
                    </p>
                  )}
                  {resultado.telefone && <p>Telefone: {resultado.telefone}</p>}
                  {resultado.email && <p>Email: {resultado.email}</p>}
                </div>
              )}

              {lastChecked && (
                <p className="text-[10px] text-[var(--color-muted-foreground)]">
                  Validado em {lastChecked.toLocaleString("pt-BR")}. Cache válido por 7 dias.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
