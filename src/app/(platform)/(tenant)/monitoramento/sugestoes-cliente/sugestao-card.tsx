"use client";

import { useTransition } from "react";
import { UserPlus, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { aceitarVinculoExistente, aceitarCriarCliente, rejeitarSugestao } from "./actions";

interface SugestaoCardProps {
  sugestao: {
    id: string;
    nome_detectado: string;
    polo: "autor" | "reu";
    tipo: "vincular_existente" | "criar_novo";
    similaridade: number | null;
    processo: { cnj: string; classe_nome: string | null } | null;
    cliente_sugerido: { name: string } | null;
  };
}

export function SugestaoCard({ sugestao }: SugestaoCardProps) {
  const [pending, startTransition] = useTransition();
  const percentual = sugestao.similaridade != null ? Math.round(sugestao.similaridade * 100) : null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Processo {sugestao.processo?.cnj ?? "?"} — {sugestao.polo === "autor" ? "autor" : "réu"}:{" "}
            <strong>{sugestao.nome_detectado}</strong>
          </span>
          <Badge variant="outline" className="gap-1">
            {sugestao.tipo === "vincular_existente" ? <Link2 className="h-3 w-3" /> : <UserPlus className="h-3 w-3" />}
            {sugestao.tipo === "vincular_existente" ? "cliente parecido" : "cliente não encontrado"}
          </Badge>
        </div>

        {sugestao.tipo === "vincular_existente" ? (
          <div className="space-y-2">
            <p className="text-sm">
              Parece ser o cliente <strong>{sugestao.cliente_sugerido?.name ?? "?"}</strong>
              {percentual != null && <span className="text-muted-foreground"> ({percentual}% parecido)</span>}
            </p>
            <div className="flex gap-2">
              <Button disabled={pending} onClick={() => startTransition(() => aceitarVinculoExistente(sugestao.id))}>
                Vincular
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => startTransition(() => rejeitarSugestao(sugestao.id))}>
                Não é esse cliente
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum cliente cadastrado com nome parecido.</p>
            <div className="flex gap-2">
              <Button disabled={pending} onClick={() => startTransition(() => aceitarCriarCliente(sugestao.id))}>
                Criar cliente &ldquo;{sugestao.nome_detectado}&rdquo; e vincular
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => startTransition(() => rejeitarSugestao(sugestao.id))}>
                Ignorar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
