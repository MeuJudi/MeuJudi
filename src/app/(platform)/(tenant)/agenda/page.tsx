import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const days = Array.from({ length: 35 }, (_, index) => index + 1);
const events: Record<number, { label: string; tone: "urgent" | "normal" | "later" }[]> = {
  13: [{ label: "Reuniao - Ramos", tone: "later" }],
  16: [{ label: "Contestacao - Cobranca", tone: "urgent" }],
  21: [{ label: "Audiencia - Andrade, 14h", tone: "normal" }],
  28: [{ label: "Retorno cliente Bertoni", tone: "later" }],
};

const toneClass = {
  urgent: "border-[var(--tenant-wine)] bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] text-[var(--tenant-wine)]",
  normal: "border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_12%,transparent)] text-[#8c6425]",
  later: "border-[var(--tenant-moss)] bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] text-[var(--tenant-moss)]",
};

export default function AgendaPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--color-card-foreground)]">Agenda</h1>
          <p className="mt-2 text-sm text-muted-foreground">Prazos e audiencias, com contagem automatica em dias uteis.</p>
        </div>
        <span className="rounded-full border border-[color-mix(in_srgb,var(--tenant-moss)_25%,transparent)] bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] px-3 py-1 font-mono text-xs text-[var(--tenant-moss)]">
          3 prazos essa semana
        </span>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="min-w-36 font-display text-xl font-bold text-[var(--color-card-foreground)]">Julho 2026</h2>
          <Button variant="outline" size="sm" aria-label="Proximo mes"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-wine)]" />Prazo fatal</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-brass)]" />Audiencia</span>
          <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-moss)]" />Interno</span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 bg-[var(--tenant-sidebar)] text-center text-[11px] font-semibold uppercase tracking-wide text-[#c9c2ad]">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map((day) => <div key={day} className="p-3">{day}</div>)}
        </div>
        <CardContent className="grid grid-cols-7 p-0">
          {days.map((day) => (
            <div key={day} className="min-h-24 border-b border-r border-border p-2 text-sm last:border-r-0">
              <span className="font-mono text-xs text-muted-foreground">{day}</span>
              <div className="mt-2 space-y-1">
                {events[day]?.map((event) => (
                  <div key={event.label} className={`truncate rounded border-l-2 px-2 py-1 text-[11px] ${toneClass[event.tone]}`}>
                    {event.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
