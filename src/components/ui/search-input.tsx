"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, X, FileText, Users, Briefcase, Calendar, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type SearchHitType = "processo" | "cliente" | "tarefa" | "agenda" | "honorario";

export type SearchHit = {
  id: string;
  type: SearchHitType;
  title: string;
  subtitle: string;
  meta?: string;
  href?: string;
};

type Item = {
  id: string;
  type: SearchHitType;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
  keywords?: string;
};

type Props = {
  // lista local para sugestões client-side (filtra na hora)
  items?: Item[];
  // server action referenciada diretamente para serialização RSC
  // Aceita qualquer função que receba (query, options) e retorne Promise<SearchHit[]>
  onServerSearch?: (q: string, options?: Record<string, unknown>) => Promise<SearchHit[]>;
  // placeholder da input
  placeholder?: string;
  // ao clicar em um item
  onSelect?: (hit: SearchHit) => void;
  // modo: navegar para rota (default) ou só selecionar
  mode?: "navigate" | "select";
  // limite de sugestões client-side
  clientLimit?: number;
  // classes extras
  className?: string;
  // valor controlado (prioridade sobre defaultValue)
  value?: string;
  // onChange controlado
  onChange?: (value: string) => void;
  // valor inicial (uncontrolled)
  defaultValue?: string;
  // escopo (ex: filtrar por categoria na lista local)
  scope?: (item: Item) => boolean;
};

const typeIcon: Record<SearchHitType, React.ComponentType<{ className?: string }>> = {
  processo: FileText,
  cliente: Users,
  tarefa: Briefcase,
  agenda: Calendar,
  honorario: Sparkles,
};

const typeLabel: Record<SearchHitType, string> = {
  processo: "Processo",
  cliente: "Cliente",
  tarefa: "Tarefa",
  agenda: "Agenda",
  honorario: "Honorário",
};

const typeTone: Record<SearchHitType, string> = {
  processo: "text-blue-700",
  cliente: "text-emerald-700",
  tarefa: "text-[var(--tenant-brass)]",
  agenda: "text-purple-700",
  honorario: "text-amber-700",
};

function highlight(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-[color-mix(in_srgb,var(--tenant-brass)_18%,transparent)] px-0.5 text-[var(--tenant-surface-foreground)]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchInput({
  items = [],
  onServerSearch,
  placeholder = "Buscar...",
  onSelect,
  mode = "navigate",
  clientLimit = 5,
  className,
  value: controlledValue,
  onChange: controlledOnChange,
  defaultValue = "",
  scope,
}: Props) {
  const isControlled = controlledValue !== undefined;
  const [internalQuery, setInternalQuery] = useState(defaultValue);
  const query = isControlled ? controlledValue : internalQuery;

  function setQuery(v: string) {
    if (isControlled) {
      controlledOnChange?.(v);
    } else {
      setInternalQuery(v);
    }
  }
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const [serverHits, setServerHits] = useState<SearchHit[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const localHits = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const filtered = items
      .filter((it) => (scope ? scope(it) : true))
      .filter((it) => {
        const haystack = `${it.title} ${it.subtitle ?? ""} ${it.meta ?? ""} ${it.keywords ?? ""}`.toLowerCase();
        return haystack.includes(term);
      });
    return filtered.slice(0, clientLimit);
  }, [items, query, clientLimit, scope]);

  // Server search (debounce)
  useEffect(() => {
    if (!onServerSearch) return;
    const term = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (term.length < 2) {
      setServerHits([]);
      setServerLoading(false);
      return;
    }
    setServerLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const result = await onServerSearch(term);
        setServerHits(result);
      } catch (err) {
        console.error("[search]", err);
        setServerHits([]);
      } finally {
        setServerLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, onServerSearch]);

  // Combina local + server (server tem prioridade se tiver resultado)
  const allHits = useMemo<SearchHit[]>(() => {
    const merged: SearchHit[] = [
      ...localHits.map((it) => ({
        id: `local-${it.type}-${it.id}`,
        type: it.type,
        title: it.title,
        subtitle: it.subtitle ?? "",
        meta: it.meta,
        href: it.href,
      })),
      ...serverHits.filter(
        (s) => !localHits.some((l) => `${l.type}-${l.id}` === `${s.type}-${s.id}` && s.title === l.title)
      ),
    ];
    return merged;
  }, [localHits, serverHits]);

  const grouped = useMemo(() => {
    const g: Partial<Record<SearchHitType, SearchHit[]>> = {};
    for (const h of allHits) {
      if (!g[h.type]) g[h.type] = [];
      g[h.type]!.push(h);
    }
    return g;
  }, [allHits]);

  // Flat para navegação por teclado
  const flatHits = useMemo(() => Object.values(grouped).flat(), [grouped]);

  // Click outside para fechar
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Resetar índice ativo quando muda resultado
  useEffect(() => {
    setActiveIdx(0);
  }, [allHits]);

  function handleSelect(hit: SearchHit) {
    if (onSelect) onSelect(hit);
    if (mode === "navigate" && hit.href) {
      window.location.href = hit.href;
    }
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || flatHits.length === 0) {
      if (e.key === "ArrowDown" && flatHits.length > 0) setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % flatHits.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + flatHits.length) % flatHits.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flatHits[activeIdx];
      if (hit) handleSelect(hit);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length > 0;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <label
        className={cn(
          "flex items-center gap-2 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-3 py-2 text-sm text-[var(--color-muted-foreground)] transition-colors",
          open && "border-[var(--tenant-brass)]"
        )}
      >
        {serverLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Search className="h-4 w-4" />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full min-w-0 bg-transparent text-[var(--color-card-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setServerHits([]);
              inputRef.current?.focus();
            }}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--tenant-brass)]"
            title="Limpar busca"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </label>

      {showDropdown && (
        <div
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface)] shadow-lg"
          role="listbox"
        >
          {flatHits.length === 0 ? (
            <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
              Nenhum resultado para "{query}"
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              {Object.entries(grouped).map(([type, hits]) => {
                if (!hits || hits.length === 0) return null;
                const Icon = typeIcon[type as SearchHitType];
                return (
                  <div key={type} className="border-b border-[var(--tenant-line)] last:border-b-0">
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
                      {typeLabel[type as SearchHitType]}s
                    </div>
                    {hits.map((hit) => {
                      const flatIdx = flatHits.indexOf(hit);
                      const isActive = flatIdx === activeIdx;
                      const IconItem = typeIcon[hit.type];
                      return (
                        <button
                          key={hit.id}
                          type="button"
                          onClick={() => handleSelect(hit)}
                          onMouseEnter={() => setActiveIdx(flatIdx)}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
                            isActive
                              ? "bg-[color-mix(in_srgb,var(--tenant-brass)_10%,transparent)]"
                              : "hover:bg-[var(--tenant-surface-muted)]"
                          )}
                          role="option"
                          aria-selected={isActive}
                        >
                          <IconItem
                            className={cn("h-4 w-4 shrink-0", typeTone[hit.type])}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-[var(--color-card-foreground)]">
                              {highlight(hit.title, query)}
                            </p>
                            {hit.subtitle && (
                              <p className="truncate text-xs text-[var(--color-muted-foreground)]">
                                {highlight(hit.subtitle, query)}
                              </p>
                            )}
                          </div>
                          {hit.meta && (
                            <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">
                              {hit.meta}
                            </span>
                          )}
                          {isActive && (
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--tenant-brass)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// helper pra popular `items` a partir de lista de objetos genéricos
export function toItem<T extends { id: string }>(
  type: SearchHitType,
  items: T[],
  pick: (it: T) => { title: string; subtitle?: string; meta?: string; href?: string }
): Item[] {
  return items.map((it) => ({ id: it.id, type, ...pick(it) }));
}
