"use client";

import { useState } from "react";
import { palettes, type PaletteId } from "@/lib/themes/palettes";

export function AppearanceSettings() {
  const [paletteId, setPaletteId] = useState<PaletteId>(() => {
    if (typeof window === "undefined") return "padrao";
    return (window.localStorage.getItem("meujudi-palette") as PaletteId | null) ?? "padrao";
  });

  function updatePalette(nextPalette: PaletteId) {
    setPaletteId(nextPalette);
    window.localStorage.setItem("meujudi-palette", nextPalette);
    // eslint-disable-next-line react-hooks/immutability -- Persistencia intencional em cookie para SSR ler o tema.
    window.document.cookie = `meujudi-palette=${nextPalette};path=/;max-age=31536000;SameSite=Lax`;
    window.dispatchEvent(
      new CustomEvent("meujudi-theme-change", {
        detail: { theme: "custom", palette: nextPalette },
      }),
    );
  }

  const currentPalette = palettes.find((p) => p.id === paletteId) ?? palettes[0];

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-3 text-sm font-semibold text-[var(--color-card-foreground)]">
          Aparência
        </h4>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
          {palettes.map((palette) => {
            const active = paletteId === palette.id;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => updatePalette(palette.id)}
                className={`group flex flex-col items-center gap-2 rounded-lg p-2 transition-all ${
                  active
                    ? "bg-[var(--color-primary)]/8 ring-2 ring-[var(--color-primary)]"
                    : "hover:bg-[var(--color-muted)]"
                }`}
              >
                <div className="relative">
                  <div
                    className="h-10 w-10 rounded-full ring-2 ring-offset-2 ring-offset-[var(--color-card)] transition-shadow group-hover:ring-[var(--color-primary)]/50"
                    style={{
                      background: palette.swatch,
                    }}
                  />
                  {active && (
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-full"
                      style={{ color: palette.sidebar }}
                    >
                      <svg className="h-4 w-4 drop-shadow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>
                <span
                  className={`text-[11px] font-medium leading-tight text-center ${
                    active ? "text-[var(--color-primary)]" : "text-[var(--color-muted-foreground)]"
                  }`}
                >
                  {palette.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <h4 className="mb-3 text-sm font-semibold text-[var(--color-card-foreground)]">
          Pré-visualização
        </h4>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-md"
              style={{ background: currentPalette.accent }}
            />
            <div className="flex-1">
              <div className="h-3 w-32 rounded bg-[var(--color-muted)]" />
              <div className="mt-1.5 h-2 w-48 rounded bg-[var(--color-muted)]/60" />
            </div>
            <div
              className="h-7 rounded-md px-3 py-1 text-xs font-medium text-white"
              style={{ background: currentPalette.accent }}
            >
              Botão
            </div>
          </div>
          <div className="flex gap-2">
            <div
              className="h-6 w-6 rounded-full border-2 border-white"
              style={{ background: currentPalette.sidebar }}
            />
            <div
              className="h-6 w-6 rounded-full border-2 border-white"
              style={{ background: currentPalette.accent }}
            />
            <div
              className="h-6 w-6 rounded-full border-2 border-white"
              style={{ background: currentPalette.paper }}
            />
            <div
              className="h-6 w-6 rounded-full border-2 border-white"
              style={{ background: currentPalette.surfaceMuted }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
