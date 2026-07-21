"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { confirmarItemRevisao, corrigirItemRevisao } from "./actions";

interface ItemRevisaoCardProps {
  item: {
    id: string;
    campo: string;
    texto_original: string;
    trecho_destacado: string | null;
    valor_sugerido: Record<string, unknown> | null;
    confianca: string;
    processo: { cnj: string; classe_nome: string | null } | null;
  };
}

export function ItemRevisaoCard({ item }: ItemRevisaoCardProps) {
  const [editando, setEditando] = useState(false);
  const [valorCorrigido, setValorCorrigido] = useState(JSON.stringify(item.valor_sugerido ?? {}));
  const [pending, startTransition] = useTransition();

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Processo {item.processo?.cnj ?? "?"} — campo: <strong>{item.campo}</strong>
          </span>
          <Badge variant="outline" className="gap-1 border-amber-400 text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Confiança {item.confianca}
          </Badge>
        </div>

        <blockquote className="border-l-2 border-amber-400 bg-amber-50 py-2 pl-3 text-sm">
          {item.trecho_destacado ?? item.texto_original}
        </blockquote>

        <div className="text-sm">
          <strong>O sistema entendeu:</strong>{" "}
          {item.valor_sugerido ? JSON.stringify(item.valor_sugerido) : "(nada conclusivo)"}
        </div>

        {editando ? (
          <div className="flex gap-2">
            <Input value={valorCorrigido} onChange={(e) => setValorCorrigido(e.target.value)} />
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await corrigirItemRevisao(item.id, JSON.parse(valorCorrigido));
                })
              }
            >
              Salvar correção
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button
              disabled={pending}
              onClick={() => startTransition(async () => confirmarItemRevisao(item.id))}
            >
              Confirmar
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => setEditando(true)}>
              Corrigir
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
