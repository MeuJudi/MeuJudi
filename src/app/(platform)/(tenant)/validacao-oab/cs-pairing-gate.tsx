"use client";

// Detecta em tempo real quando o CS é pareado. Faz polling a cada 5s
// via uma server action leve (apenas conta devices ativos) e chama
// router.refresh() quando o número muda de 0 para >0.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, MonitorSmartphone, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { checarCsPareado } from "./actions";

interface CsPairingGateProps {
  tenantId: string;
}

export function CsPairingGate({ tenantId }: CsPairingGateProps) {
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [pareado, setPareado] = useState(false);
  const [, startTransition] = useTransition();
  const tentativasRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function tick() {
      if (cancelled) return;
      setVerificando(true);
      try {
        const result = await checarCsPareado(tenantId);
        if (cancelled) return;
        tentativasRef.current += 1;
        if (result.pareado && !pareado) {
          // CS acabou de parear — recarrega a página para mostrar o form.
          startTransition(() => router.refresh());
          return;
        }
        setPareado(result.pareado);
      } catch {
        // Falha de rede — tenta de novo no próximo tick.
      } finally {
        if (!cancelled) {
          setVerificando(false);
          timer = setTimeout(tick, 5000);
        }
      }
    }

    tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [tenantId, pareado, router]);

  return (
    <Card className="animate-scale-in border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
      <CardContent className="space-y-5 p-6">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-700">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-[var(--color-card-foreground)]">
              Conecte o MeuJudi CS para continuar
            </h2>
            <p className="mt-0.5 text-sm text-[var(--color-muted-foreground)]">
              A validação da OAB pelo ConfirmADV é feita pelo app desktop
              MeuJudi CS. Sem ele conectado, não conseguimos abrir a janela
              oficial nem receber o resultado.
            </p>
          </div>
        </div>

        <ol className="space-y-3 rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-4 text-sm">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
              1
            </span>
            <div>
              <p className="font-medium text-[var(--color-card-foreground)]">Baixe o MeuJudi CS</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Windows 10/11 (64 bits). Instalador de ~150 MB.
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
              2
            </span>
            <div>
              <p className="font-medium text-[var(--color-card-foreground)]">Instale e abra o app</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                O ícone do CS aparece na bandeja do Windows (próximo ao relógio).
              </p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
              3
            </span>
            <div>
              <p className="font-medium text-[var(--color-card-foreground)]">Gere um código de pareamento</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                Em <strong>Configurações → MeuJudi CS</strong>, gere um código de 8 caracteres
                e digite no app. Esta tela vai detectar automaticamente.
              </p>
            </div>
          </li>
        </ol>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/configuracoes/meujudi-cs">
              <MonitorSmartphone className="mr-2 h-4 w-4" />
              Ir para configurações
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href="https://github.com/MeuJudi/MeuJudi/releases/latest"
              target="_blank"
              rel="noreferrer"
            >
              <Download className="mr-2 h-4 w-4" />
              Baixar instalador
            </a>
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
          {verificando ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Verificando conexão com o MeuJudi CS...
            </>
          ) : pareado ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin" />
              Conexão detectada, recarregando...
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              Verificação a cada 5 segundos. Pode parear o CS em outra aba.
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
