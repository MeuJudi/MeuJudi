"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, Plus, RefreshCw, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  adicionarHonorarioCustom,
  atualizarValorEscritorio,
  resetarTabelaHonorarios,
  restaurarValorSugerido,
  seedHonorariosSugeridos,
  toggleHonorarioAtivo,
} from "./actions";

type Unidade = "hora" | "servico" | "mes" | "consulta" | "percentual" | "fixo";

type Honorario = {
  id: string;
  categoria: string;
  servico: string;
  descricao: string | null;
  unidade: Unidade;
  valor_sugerido_oab: number;
  valor_minimo: number | null;
  valor_maximo: number | null;
  valor_escritorio: number | null;
  base_legal: string | null;
  ativo: boolean;
  customizado: boolean;
};

type Props = {
  initial: Honorario[];
};

const unidadeLabel: Record<Unidade, string> = {
  hora: "/hora",
  servico: "/serviço",
  mes: "/mês",
  consulta: "/consulta",
  percentual: "%",
  fixo: "(fixo)",
};

function formatValor(valor: number, unidade: Unidade): string {
  const formatted = valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  if (unidade === "percentual") return `${formatted}%`;
  return `R$ ${formatted}${unidadeLabel[unidade] ?? ""}`;
}

const categorias = [
  "consultoria",
  "peticao",
  "audiencia",
  "recurso",
  "contrato",
  "direito_trabalho",
  "direito_civil",
  "direito_familia",
  "direito_penal",
  "direito_tributario",
  "direito_empresarial",
  "direito_consumidor",
  "direito_imobiliario",
  "extrajudicial",
];

const categoriaLabel: Record<string, string> = {
  consultoria: "Consultoria",
  peticao: "Petição",
  audiencia: "Audiência",
  recurso: "Recurso",
  contrato: "Contrato",
  direito_trabalho: "Direito do Trabalho",
  direito_civil: "Direito Civil",
  direito_familia: "Direito de Família",
  direito_penal: "Direito Penal",
  direito_tributario: "Direito Tributário",
  direito_empresarial: "Direito Empresarial",
  direito_consumidor: "Direito do Consumidor",
  direito_imobiliario: "Direito Imobiliário",
  extrajudicial: "Extrajudicial",
};

export function HonorariosView({ initial }: Props) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "custom" | "active">("all");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return initial.filter((h) => {
      if (filter === "custom" && !h.customizado) return false;
      if (filter === "active" && !h.ativo) return false;
      if (!term) return true;
      return (
        h.servico.toLowerCase().includes(term) ||
        h.categoria.toLowerCase().includes(term) ||
        (h.descricao ?? "").toLowerCase().includes(term)
      );
    });
  }, [initial, query, filter]);

  const grouped = useMemo(() => {
    const groups: Record<string, Honorario[]> = {};
    for (const h of filtered) {
      if (!groups[h.categoria]) groups[h.categoria] = [];
      groups[h.categoria].push(h);
    }
    return groups;
  }, [filtered]);

  function handleUpdateValor(id: string, valor: number | null) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await atualizarValorEscritorio(id, valor);
        setSuccess("Valor atualizado.");
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao atualizar valor.");
      }
    });
  }

  function handleRestaurar(id: string) {
    setError(null);
    startTransition(async () => {
      try {
        await restaurarValorSugerido(id);
        setSuccess("Valor restaurado para a sugestão da OAB.");
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao restaurar valor.");
      }
    });
  }

  function handleToggleAtivo(id: string, ativo: boolean) {
    setError(null);
    startTransition(async () => {
      try {
        await toggleHonorarioAtivo(id, ativo);
        setSuccess(ativo ? "Honorário ativado." : "Honorário desativado.");
        setTimeout(() => setSuccess(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao alterar status.");
      }
    });
  }

  function handleSeed() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await seedHonorariosSugeridos();
        const message: string =
          "message" in result && result.message
            ? result.message
            : `Tabela populada com ${result.total} serviços.`;
        setSuccess(message);
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao popular tabela.");
      }
    });
  }

  function handleReset() {
    if (
      !window.confirm(
        "Isso vai apagar todos os valores customizados e restaurar a tabela original. Continuar?"
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      try {
        await resetarTabelaHonorarios();
        setSuccess("Tabela resetada e repopulada.");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao resetar.");
      }
    });
  }

  function handleAddCustom(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await adicionarHonorarioCustom(formData);
        setSuccess("Serviço adicionado.");
        setShowAdd(false);
        setTimeout(() => window.location.reload(), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao adicionar.");
      }
    });
  }

  if (initial.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
            Tabela de honorários sugeridos
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Valores sugeridos pela OAB (referência). Você pode customizar por serviço.
          </p>
        </div>

        <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
          <CardContent className="p-8 text-center">
            <p className="text-[var(--color-muted-foreground)]">
              Sua tabela ainda não foi populada.
            </p>
            <Button
              onClick={handleSeed}
              disabled={isPending}
              className="mt-4 bg-[var(--tenant-brass)] text-white"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Popular tabela com sugestões da OAB
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold text-[var(--color-card-foreground)]">
            Tabela de honorários sugeridos
          </h2>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Baseada na tabela da OAB. Edite o valor do escritório por serviço.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowAdd(!showAdd)}
            variant="outline"
            className="border-[var(--tenant-line)]"
          >
            <Plus className="h-4 w-4" />
            Serviço custom
          </Button>
          <Button
            onClick={handleReset}
            disabled={isPending}
            variant="outline"
            className="border-[var(--tenant-line)] text-[var(--color-muted-foreground)]"
          >
            <RefreshCw className="h-4 w-4" />
            Resetar tabela
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-700">
          {success}
        </div>
      )}

      {showAdd && (
        <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
          <CardContent className="p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddCustom(new FormData(e.currentTarget));
              }}
              className="grid gap-3 md:grid-cols-3"
            >
              <div>
                <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                  Categoria
                </label>
                <select
                  name="categoria"
                  required
                  className="mt-1 flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 text-sm text-[var(--color-card-foreground)]"
                >
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {categoriaLabel[c] ?? c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                  Serviço
                </label>
                <Input
                  name="servico"
                  required
                  placeholder="ex: parecer_juridico_especializado"
                  className="mt-1 border-[var(--tenant-line)] bg-[var(--tenant-surface)]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                  Unidade
                </label>
                <select
                  name="unidade"
                  className="mt-1 flex h-9 w-full rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 text-sm text-[var(--color-card-foreground)]"
                >
                  <option value="servico">Por serviço</option>
                  <option value="hora">Por hora</option>
                  <option value="mes">Por mês</option>
                  <option value="consulta">Por consulta</option>
                  <option value="percentual">Percentual</option>
                  <option value="fixo">Valor fixo</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                  Descrição
                </label>
                <Input
                  name="descricao"
                  placeholder="Detalhe opcional"
                  className="mt-1 border-[var(--tenant-line)] bg-[var(--tenant-surface)]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                  Valor (R$)
                </label>
                <Input
                  name="valor_escritorio"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  className="mt-1 border-[var(--tenant-line)] bg-[var(--tenant-surface)]"
                />
              </div>
              <div className="flex items-end gap-2 md:col-span-3">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-[var(--tenant-brass)] text-white"
                >
                  Salvar serviço
                </Button>
                <Button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  variant="outline"
                  className="border-[var(--tenant-line)]"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-[260px] flex-1 items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-[var(--color-muted-foreground)]">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" /></svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por serviço ou categoria"
            className="w-full bg-transparent text-[var(--color-card-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
        </label>
        <div className="inline-flex rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-1">
          {([
            ["all", "Todos"],
            ["custom", "Customizados"],
            ["active", "Ativos"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded px-3 py-1 text-xs font-semibold transition-colors ${
                filter === key
                  ? "bg-[var(--tenant-brass)] text-white"
                  : "text-[var(--color-muted-foreground)] hover:text-[var(--color-card-foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(grouped).map(([categoria, items]) => (
          <Card key={categoria} className="border-[var(--tenant-line)] bg-[var(--tenant-surface)]">
            <CardContent className="p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                {categoriaLabel[categoria] ?? categoria}
              </h3>
              <div className="space-y-2">
                {items.map((h) => (
                  <div
                    key={h.id}
                    className={`grid gap-3 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3 md:grid-cols-[1fr_180px_180px_120px] ${
                      !h.ativo ? "opacity-50" : ""
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-[var(--color-card-foreground)]">
                        {h.descricao ?? h.servico.replace(/_/g, " ")}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
                        <span className="font-mono text-[10px]">{h.servico}</span>
                        {h.customizado && (
                          <Badge
                            variant="outline"
                            className="border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_10%,transparent)] text-[var(--tenant-brass)]"
                          >
                            custom
                          </Badge>
                        )}
                        {h.base_legal && (
                          <span className="text-[10px]">base: {h.base_legal}</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                        Sugestão OAB
                      </p>
                      <p className="font-mono text-sm text-[var(--color-card-foreground)]">
                        {formatValor(h.valor_sugerido_oab, h.unidade)}
                      </p>
                      {h.valor_minimo != null && h.valor_maximo != null && (
                        <p className="text-[10px] text-[var(--color-muted-foreground)]">
                          faixa: {formatValor(h.valor_minimo, h.unidade)} ~{" "}
                          {formatValor(h.valor_maximo, h.unidade)}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-muted-foreground)]">
                        Valor do escritório
                      </p>
                      <HonorarioValorInput
                        id={h.id}
                        unidade={h.unidade}
                        value={h.valor_escritorio}
                        onSave={(val) => handleUpdateValor(h.id, val)}
                        onRestore={() => handleRestaurar(h.id)}
                        disabled={isPending}
                      />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleToggleAtivo(h.id, !h.ativo)}
                        disabled={isPending}
                        className="h-7 w-7 p-0 text-[var(--color-muted-foreground)]"
                        title={h.ativo ? "Desativar" : "Ativar"}
                      >
                        {h.ativo ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {Object.keys(grouped).length === 0 && (
          <p className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            Nenhum honorário encontrado com esse filtro.
          </p>
        )}
      </div>
    </div>
  );
}

function HonorarioValorInput({
  value,
  onSave,
  onRestore,
  disabled,
}: {
  id: string;
  unidade: Unidade;
  value: number | null;
  onSave: (value: number | null) => void;
  onRestore: () => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string>(value?.toString() ?? "");
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          type="number"
          step="0.01"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft) onSave(Number(draft));
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-7 border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-xs"
        />
        <Button
          size="sm"
          onClick={() => draft && onSave(Number(draft))}
          disabled={disabled || !draft}
          className="h-7 px-2 text-xs"
        >
          ok
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="font-mono text-sm font-bold text-[var(--tenant-brass)] hover:underline"
      >
        {value != null
          ? `R$ ${value.toLocaleString("pt-BR", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}`
          : "definir"}
      </button>
      {value != null && (
        <button
          type="button"
          onClick={onRestore}
          disabled={disabled}
          className="text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]"
          title="Restaurar sugestão OAB"
        >
          reset
        </button>
      )}
    </div>
  );
}
