"use client";

// Fase 2 (tela Web) — acompanhamento de status, mesmo padrão de polling
// client-side já usado em process-details-modal.tsx (getMuralSyncRequest),
// já que o projeto não usa Supabase Realtime em nenhum lugar.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cancelarSolicitacaoValidacao, getStatusSolicitacaoValidacao } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  pendente: "Solicitação registrada",
  aguardando_cs: "Aguardando o MeuJudi CS",
  recaptcha_em_andamento: "Verificação em andamento",
  aguardando_codigo: "Aguardando confirmação por e-mail",
  validando: "Confirmando resultado",
  validada: "Identidade validada",
  recusada: "Validação recusada",
  expirada: "Solicitação expirada",
  erro: "Erro técnico",
  cancelada: "Solicitação cancelada",
};

const STATUS_TEXTO: Record<string, string> = {
  pendente:
    "Sua solicitação foi registrada. Abra o MeuJudi CS em um dispositivo pareado a este escritório para continuar a verificação pelo ConfirmADV.",
  aguardando_cs: "Aguardando o MeuJudi CS iniciar a verificação.",
  recaptcha_em_andamento: "A janela do ConfirmADV foi aberta no MeuJudi CS. Conclua a verificação de segurança por lá.",
  aguardando_codigo: "Confira o e-mail profissional informado e confirme o código enviado pelo ConfirmADV.",
  validando: "Confirmando o resultado da verificação.",
  validada: "Sua identidade profissional foi validada.",
  recusada: "Não foi possível confirmar esses dados. Confira a OAB, UF e o e-mail profissional cadastrado na OAB.",
  expirada: "Essa solicitação expirou. Inicie uma nova tentativa.",
  erro: "Ocorreu um erro técnico durante a verificação.",
  cancelada: "Essa solicitação foi cancelada.",
};

const ESTADOS_TERMINAIS = ["validada", "recusada", "expirada", "erro", "cancelada"];

interface StatusCardProps {
  validationId: string;
  initialStatus: string;
  initialLastError: string | null;
}

export function StatusCard({ validationId, initialStatus, initialLastError }: StatusCardProps) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [lastError, setLastError] = useState(initialLastError);
  const [cancelando, setCancelando] = useState(false);
  const [erroCancelamento, setErroCancelamento] = useState<string | null>(null);
  // W7 — auditoria: useMemo para evitar recálculo a cada render (o
  // componente re-renderiza a cada 2s do polling).
  const terminal = useMemo(() => ESTADOS_TERMINAIS.includes(status), [status]);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    if (terminal) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      try {
        const result = await getStatusSolicitacaoValidacao(validationId);
        if (!active) return;
        if (result.ok) {
          setStatus(result.status);
          setLastError(result.lastError);
          if (ESTADOS_TERMINAIS.includes(result.status)) {
            // Estado terminal: deixa a página (Server Component) decidir o
            // que mostrar a seguir — ex.: reabrir o formulário pra uma nova
            // tentativa em caso de recusa/expiração/erro.
            router.refresh();
            return;
          }
        }
      } catch {
        // Falha de rede pontual — tenta de novo no próximo ciclo, sem interromper o polling.
      }
      if (active && !ESTADOS_TERMINAIS.includes(statusRef.current)) {
        timer = setTimeout(tick, 2000);
      }
    }

    timer = setTimeout(tick, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [validationId, terminal, router]);

  async function handleCancelar() {
    setCancelando(true);
    setErroCancelamento(null);
    try {
      await cancelarSolicitacaoValidacao(validationId);
      router.refresh();
    } catch (err) {
      setErroCancelamento(err instanceof Error ? err.message : "Não foi possível cancelar a solicitação.");
    } finally {
      setCancelando(false);
    }
  }

  const podeCancelar = !terminal;
  const badgeClasses = status === "validada"
    ? "border-green-300 bg-green-50 text-green-800"
    : status === "recusada" || status === "erro" || status === "expirada"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
      <CardContent className="space-y-3 p-6">
        <span className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses}`}>
          {!terminal ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {STATUS_LABEL[status] ?? status}
        </span>
        <p className="text-sm text-[var(--color-muted-foreground)]">
          {STATUS_TEXTO[status] ?? "Status desconhecido."}
        </p>
        {lastError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {lastError}
          </p>
        ) : null}
        {erroCancelamento ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erroCancelamento}
          </p>
        ) : null}
        {podeCancelar ? (
          <Button type="button" variant="outline" onClick={handleCancelar} disabled={cancelando}>
            {cancelando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Cancelar solicitação
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
