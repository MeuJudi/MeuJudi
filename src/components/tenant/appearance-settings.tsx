"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ThemeMode } from "@/components/tenant/tenant-shell";

const options: { value: ThemeMode; label: string; description: string }[] = [
  { value: "default", label: "Padrao MeuJudi", description: "Azul escuro, papel claro e brass." },
  { value: "light", label: "Tema claro", description: "Fundos mais brancos e neutros." },
  { value: "dark", label: "Tema escuro", description: "Grafite/preto com alto contraste." },
  { value: "custom", label: "Personalizado", description: "Gera menu escuro e pagina clara pela cor." },
];

export function AppearanceSettings() {
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "default";
    return (window.localStorage.getItem("meujudi-theme") as ThemeMode | null) ?? "default";
  });
  const [color, setColor] = useState(() => {
    if (typeof window === "undefined") return "#d9468f";
    return window.localStorage.getItem("meujudi-custom-color") ?? "#d9468f";
  });

  function updateTheme(nextTheme: ThemeMode, nextColor = color) {
    setTheme(nextTheme);
    setColor(nextColor);
    window.localStorage.setItem("meujudi-theme", nextTheme);
    window.localStorage.setItem("meujudi-custom-color", nextColor);
    window.dispatchEvent(new CustomEvent("meujudi-theme-change", {
      detail: { theme: nextTheme, color: nextColor },
    }));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => updateTheme(option.value)}
            className={`rounded-md border p-3 text-left transition-colors ${
              theme === option.value ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"
            }`}
          >
            <span className="block text-sm font-semibold text-[var(--color-card-foreground)]">{option.label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-muted/30 p-3">
        <label htmlFor="theme-color" className="text-sm font-medium text-[var(--color-card-foreground)]">
          Cor personalizada
        </label>
        <input
          id="theme-color"
          type="color"
          value={color}
          onChange={(event) => updateTheme("custom", event.target.value)}
          className="h-9 w-12 rounded border border-border bg-transparent"
        />
        <span className="font-mono text-xs text-muted-foreground">{color}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => updateTheme("custom", color)}>
          Aplicar cor
        </Button>
      </div>
    </div>
  );
}
