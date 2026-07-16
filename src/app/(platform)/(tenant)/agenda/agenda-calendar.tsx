"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type AgendaItem = {
  id: string;
  title: string;
  description: string | null;
  type: "audiencia" | "prazo" | "reuniao" | "outro";
  start: string;
  end: string | null;
  status: "pendente" | "concluido" | "cancelado";
  source: string;
  processTitle: string | null;
};

type AgendaCalendarProps = {
  initialMonth: string;
  events: AgendaItem[];
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const typeLabel = {
  audiencia: "Audiencia",
  prazo: "Prazo",
  reuniao: "Reuniao",
  outro: "Outro",
};

const typeClass = {
  audiencia: "border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_12%,transparent)] text-[#8c6425]",
  prazo: "border-[var(--tenant-wine)] bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] text-[var(--tenant-wine)]",
  reuniao: "border-[var(--tenant-moss)] bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] text-[var(--tenant-moss)]",
  outro: "border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] text-[var(--tenant-surface-foreground)]",
};

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function buildCalendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function AgendaCalendar({ initialMonth, events }: AgendaCalendarProps) {
  const [month, setMonth] = useState(() => new Date(`${initialMonth}-01T12:00:00`));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));

  const days = useMemo(() => buildCalendarDays(month), [month]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const event of events) {
      const key = event.start.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    return map;
  }, [events]);

  const selectedEvents = eventsByDay.get(selectedDate) ?? [];

  function changeMonth(offset: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--tenant-surface-foreground)]">Agenda</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Prazos, audiencias e compromissos do escritorio em uma visao mensal funcional.
          </p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">
          {events.length} evento{events.length === 1 ? "" : "s"} no periodo
        </Badge>
      </header>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" aria-label="Mes anterior" onClick={() => changeMonth(-1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-44 text-center font-display text-xl font-bold capitalize text-[var(--tenant-surface-foreground)]">
                {monthLabel(month)}
              </h2>
              <Button variant="outline" size="sm" aria-label="Proximo mes" onClick={() => changeMonth(1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-wine)]" />Prazo</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-brass)]" />Audiencia</span>
              <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-moss)]" />Reuniao</span>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[var(--tenant-line)]">
            <div className="grid grid-cols-7 bg-[var(--tenant-sidebar)] text-center text-[11px] font-semibold uppercase tracking-wide text-[var(--tenant-sidebar-foreground)]">
              {weekdays.map((day) => <div key={day} className="p-3">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 bg-[var(--tenant-surface)]">
              {days.map((date) => {
                const key = toDateKey(date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isCurrentMonth = date.getMonth() === month.getMonth();
                const isSelected = selectedDate === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(key)}
                    className={`min-h-28 border-b border-r border-[var(--tenant-line)] p-2 text-left align-top transition-colors hover:bg-[var(--tenant-surface-muted)] ${
                      isCurrentMonth ? "text-[var(--tenant-surface-foreground)]" : "bg-[var(--tenant-surface-muted)]/45 text-muted-foreground"
                    } ${isSelected ? "outline outline-2 outline-primary outline-offset-[-2px]" : ""}`}
                  >
                    <span className="font-mono text-xs">{date.getDate()}</span>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <div key={event.id} className={`truncate rounded border-l-2 px-2 py-1 text-[11px] ${typeClass[event.type]}`}>
                          {event.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 ? (
                        <div className="text-[11px] text-muted-foreground">+{dayEvents.length - 3} eventos</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-semibold">Eventos do dia</h2>
            <span className="font-mono text-xs text-muted-foreground">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-5 text-sm text-muted-foreground">
              Nenhum evento neste dia.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((event) => (
                <div key={event.id} className="rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-[var(--tenant-surface-foreground)]">{event.title}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{event.processTitle ?? event.description ?? "Sem processo vinculado"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={typeClass[event.type]}>{typeLabel[event.type]}</Badge>
                      <Badge variant="outline" className="gap-1">
                        <Clock3 className="h-3 w-3" />
                        {formatTime(event.start)}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
