"use client";

import { useState, useTransition } from "react";
import { Loader2, ShieldCheck, ShieldX, ShieldAlert, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validarOabEscritorio } from "./validar-oab";

type Resultado = {
  nome: string;
  inscricao: string;
  uf: string;
  situacao: string;
  tipo: string;
};

type Props = {
  oabId: string;
  oabNumber: string;
  oabUf: string;
  expectedName?: string | null; // nome do escritório para comparar
  initialStatus?: string | null;
  initialValidadoEm?: string | null;
  initialValidadoNome?: string | null;
  initialValidadoMatch?: boolean | null;
};

function statusTone(situacao?: string | null) {
  if (!situacao) return "muted";
  const s = situacao.toUpperCase();
  if (s.includes("ATIV") || s.includes("REGULAR") || s.includes("INSCRITO")) {
    return "ok";
  }
  if (
    s.includes("SUSPENS") ||
    s.includes("BAIXAD") ||
    s.includes("CANCELAD") ||
    s.includes("NAO_ENCONTRADO")
  ) {
    return "bad";
  }
  return "warn";
}

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function relTempo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutos = Math.floor(diff / 60_000);
  if (minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return `há ${Math.floor(dias / 30)} meses`;
}

export function OabRow({
  oabId,
  oabNumber,
  oabUf,
  expectedName,
  initialStatus,
  initialValidadoEm,
  initialValidadoNome,
  initialValidadoMatch,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(initialStatus ?? null);
  const [validadoEm, setValidadoEm] = useState<string | null>(
    initialValidadoEm ?? null
  );
  const [validadoNome, setValidadoNome] = useState<string | null>(
    initialValidadoNome ?? null
  );
  const [match, setMatch] = useState<boolean | null>(
    initialValidadoMatch ?? null
  );

  const tone = statusTone(status);
  const showResult = !!(resultado || status);

  function handleValidar() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await validarOabEscritorio(oabId);
        if (!result) {
          setResultado(null);
          setStatus("NAO_ENCONTRADO");
          setValidadoEm(new Date().toISOString());
          setValidadoNome(null);
          setMatch(false);
          return;
        }
        setResultado(result);
        setStatus(result.situacao);
        setValidadoEm(new Date().toISOString());
        setValidadoNome(result.nome);
        if (expectedName) {
          setMatch(normalizar(result.nome) === normalizar(expectedName));
        } else {
          setMatch(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao validar OAB.");
      }
    });
  }

  // Caso já tenha cache do servidor e não tenha sido revalidado pelo client
  const effectiveStatus = status ?? initialStatus ?? null;
  const effectiveTone = statusTone(effectiveStatus);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={handleValidar}
          disabled={isPending}
          size="sm"
          variant={showResult ? "outline" : "default"}
          className={cn(
            showResult
              ? "border-[var(--tenant-line)] bg-transparent"
              : "bg-[var(--tenant-brass)] text-white hover:bg-[var(--tenant-brass)]/90"
          )}
          title={`Consultar OAB ${oabNumber}/${oabUf} na base oficial`}
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : showResult ? (
            <RefreshCw className="h-3.5 w-3.5" />
          ) : (
            <ShieldCheck className="h-3.5 w-3.5" />
          )}
          {showResult ? "Reconsultar" : "Validar OAB"}
        </Button>

        {showResult && effectiveStatus && (
          <div className="flex items-center gap-2 text-xs">
            {effectiveTone === "ok" && (
              <ShieldCheck className="h-4 w-4 text-green-700" />
            )}
            {effectiveTone === "bad" && (
              <ShieldX className="h-4 w-4 text-red-700" />
            )}
            {effectiveTone === "warn" && (
              <ShieldAlert className="h-4 w-4 text-amber-700" />
            )}
            {effectiveTone === "muted" && (
              <ShieldAlert className="h-4 w-4 text-[var(--color-muted-foreground)]" />
            )}
            <span
              className={cn(
                "font-semibold",
                effectiveTone === "ok" && "text-green-700",
                effectiveTone === "bad" && "text-red-700",
                effectiveTone === "warn" && "text-amber-700",
                effectiveTone === "muted" && "text-[var(--color-muted-foreground)]"
              )}
            >
              {effectiveStatus}
            </span>
            {validadoEm && (
              <span className="text-[10px] text-[var(--color-muted-foreground)]">
                · {relTempo(validadoEm)}
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {showResult && validadoNome && (
        <div className="space-y-1 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-xs">
          <p className="font-semibold text-[var(--color-card-foreground)]">
            Nome na OAB: {validadoNome}
          </p>
          {expectedName && match === false && (
            <p className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-amber-900">
              ⚠ O nome retornado pela OAB não confere com o cadastro do
              escritório ({expectedName}). Verifique se a OAB está correta.
            </p>
          )}
          {expectedName && match === true && (
            <p className="text-green-700">✓ Nome confere com o cadastro.</p>
          )}
        </div>
      )}
    </div>
  );
}
