"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  editarRegexManualmente,
  forcarEstadoRegex,
  desativarRegexImediatamente,
  reverterPromocaoGlobal,
  ajustarTetoCustoTenant,
  reprocessarItemRevisao,
} from "./actions";

export function AcoesManuais() {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const [regexId, setRegexId] = useState("");
  const [novoPadrao, setNovoPadrao] = useState("");
  const [novasFlags, setNovasFlags] = useState("i");
  const [novoEstado, setNovoEstado] = useState<"novo" | "quente" | "confiavel" | "desativada">("quente");
  const [motivo, setMotivo] = useState("");
  const [tenantDestino, setTenantDestino] = useState("");
  const [tenantTeto, setTenantTeto] = useState("");
  const [novoTeto, setNovoTeto] = useState("");
  const [itemRevisaoId, setItemRevisaoId] = useState("");

  function executar(nome: string, acao: () => Promise<unknown>) {
    setFeedback(null);
    startTransition(async () => {
      try {
        await acao();
        setFeedback(`✅ ${nome} concluído.`);
      } catch (err) {
        setFeedback(`❌ ${nome} falhou: ${(err as Error).message}`);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ações manuais</CardTitle>
        <p className="text-sm text-muted-foreground">
          O sistema roda sozinho por padrão (auto-aprovação com rollback automático) — use isto só quando
          quiser intervir diretamente. Toda ação aqui passa pelas mesmas travas de segurança da IA e fica
          registrada no feed acima.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {feedback && <p className="text-sm">{feedback}</p>}

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor="regexId">ID da regex</Label>
            <Input id="regexId" value={regexId} onChange={(e) => setRegexId(e.target.value)} placeholder="uuid" />
          </div>
          <div>
            <Label htmlFor="novasFlags">Flags</Label>
            <Input id="novasFlags" value={novasFlags} onChange={(e) => setNovasFlags(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="novoPadrao">Editar padrão (passa pelo guard de ReDoS)</Label>
          <div className="flex gap-2">
            <Input id="novoPadrao" value={novoPadrao} onChange={(e) => setNovoPadrao(e.target.value)} placeholder="novo padrão regex" />
            <Button
              disabled={pending || !regexId || !novoPadrao}
              onClick={() => executar("Editar regex", () => editarRegexManualmente(regexId, novoPadrao, novasFlags))}
            >
              Salvar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Forçar estado</Label>
          <div className="flex gap-2">
            <Select value={novoEstado} onValueChange={(v) => setNovoEstado(v as typeof novoEstado)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="novo">novo</SelectItem>
                <SelectItem value="quente">quente</SelectItem>
                <SelectItem value="confiavel">confiavel</SelectItem>
                <SelectItem value="desativada">desativada</SelectItem>
              </SelectContent>
            </Select>
            <Button
              disabled={pending || !regexId}
              onClick={() => executar("Forçar estado", () => forcarEstadoRegex(regexId, novoEstado))}
            >
              Aplicar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="motivo">Desativar imediatamente (kill switch)</Label>
          <div className="flex gap-2">
            <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="motivo da desativação" />
            <Button
              variant="outline"
              disabled={pending || !regexId || !motivo}
              onClick={() => executar("Desativar regex", () => desativarRegexImediatamente(regexId, motivo))}
            >
              Desativar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenantDestino">Reverter promoção global (volta a ser de 1 tenant)</Label>
          <div className="flex gap-2">
            <Input id="tenantDestino" value={tenantDestino} onChange={(e) => setTenantDestino(e.target.value)} placeholder="tenant_id de destino" />
            <Button
              variant="outline"
              disabled={pending || !regexId || !tenantDestino}
              onClick={() => executar("Reverter promoção", () => reverterPromocaoGlobal(regexId, tenantDestino))}
            >
              Reverter
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenantTeto">Ajustar teto de custo (US$/dia) de um tenant</Label>
          <div className="flex gap-2">
            <Input id="tenantTeto" value={tenantTeto} onChange={(e) => setTenantTeto(e.target.value)} placeholder="tenant_id" />
            <Input value={novoTeto} onChange={(e) => setNovoTeto(e.target.value)} placeholder="novo teto USD" type="number" step="0.01" />
            <Button
              disabled={pending || !tenantTeto || !novoTeto}
              onClick={() => executar("Ajustar teto", () => ajustarTetoCustoTenant(tenantTeto, parseFloat(novoTeto)))}
            >
              Salvar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="itemRevisaoId">Reprocessar item da Central de Revisão</Label>
          <div className="flex gap-2">
            <Input id="itemRevisaoId" value={itemRevisaoId} onChange={(e) => setItemRevisaoId(e.target.value)} placeholder="id do item_revisao" />
            <Button
              disabled={pending || !itemRevisaoId}
              onClick={() => executar("Reprocessar item", () => reprocessarItemRevisao(itemRevisaoId))}
            >
              Reprocessar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
