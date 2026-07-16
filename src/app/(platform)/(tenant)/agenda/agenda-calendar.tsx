"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, GripVertical, ListChecks, Sparkles } from "lucide-react";
import { rescheduleAgendaEvent } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  responsibleName: string | null;
  responsibleAvatarUrl: string | null;
  responsibleColor: string;
};

type AgendaCalendarProps = {
  initialMonth: string;
  events: AgendaItem[];
};

type CalendarView = "month" | "week";

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const weekHeader = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];

const typeLabel = {
  audiencia: "Audiencia",
  prazo: "Prazo",
  reuniao: "Reuniao",
  outro: "Outro",
};

const typeClass = {
  audiencia: "border-[var(--tenant-brass)] bg-[color-mix(in_srgb,var(--tenant-brass)_12%,transparent)] text-[#6f4e1c]",
  prazo: "border-[var(--tenant-wine)] bg-[color-mix(in_srgb,var(--tenant-wine)_10%,transparent)] text-[var(--tenant-wine)]",
  reuniao: "border-[var(--tenant-moss)] bg-[color-mix(in_srgb,var(--tenant-moss)_10%,transparent)] text-[var(--tenant-moss)]",
  outro: "border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] text-[var(--tenant-surface-foreground)]",
};

const fixedSpecialDates = [
  { month: 1, day: 1, label: "Confraternizacao" },
  { month: 4, day: 21, label: "Tiradentes" },
  { month: 5, day: 1, label: "Dia do Trabalho" },
  { month: 9, day: 7, label: "Independencia" },
  { month: 10, day: 12, label: "Nossa Senhora" },
  { month: 11, day: 2, label: "Finados" },
  { month: 11, day: 15, label: "Republica" },
  { month: 12, day: 25, label: "Natal" },
];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
}

function shortDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(date);
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

function startOfWeek(date: Date) {
  const start = new Date(date);
  const day = start.getDay();
  const distance = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + distance);
  return start;
}

function buildWeekDays(anchor: Date) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function initials(name: string | null) {
  if (!name) return "MJ";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "MJ";
}

function specialDatesFor(date: Date) {
  return fixedSpecialDates.filter((item) => item.month === date.getMonth() + 1 && item.day === date.getDate());
}

function updateEventDate(event: AgendaItem, dateKey: string): AgendaItem {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = new Date(event.start);
  start.setFullYear(year, month - 1, day);

  let end: string | null = event.end;
  if (event.end) {
    const oldStart = new Date(event.start).getTime();
    const oldEnd = new Date(event.end).getTime();
    end = new Date(start.getTime() + Math.max(0, oldEnd - oldStart)).toISOString();
  }

  return { ...event, start: start.toISOString(), end };
}

function EventPill({ event, compact = false }: { event: AgendaItem; compact?: boolean }) {
  return (
    <div
      draggable
      onDragStart={(dragEvent) => {
        dragEvent.dataTransfer.setData("text/plain", event.id);
        dragEvent.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
        typeClass[event.type],
      )}
      title="Arraste para remarcar"
    >
      <GripVertical className="h-3 w-3 shrink-0 opacity-45 transition-opacity group-hover:opacity-80" />
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cover bg-center font-mono text-[9px] font-bold text-white ring-1 ring-white/75"
        style={{
          backgroundColor: event.responsibleColor,
          backgroundImage: event.responsibleAvatarUrl ? `url(${event.responsibleAvatarUrl})` : undefined,
        }}
      >
        {event.responsibleAvatarUrl ? null : initials(event.responsibleName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{event.title}</span>
        {!compact ? <span className="block truncate opacity-80">{formatTime(event.start)}</span> : null}
      </span>
    </div>
  );
}

function DayShell({
  date,
  currentMonth,
  selected,
  dragOver,
  events,
  onSelect,
  onDropEvent,
  children,
  className,
}: {
  date: Date;
  currentMonth?: boolean;
  selected: boolean;
  dragOver: boolean;
  events: AgendaItem[];
  onSelect: (dateKey: string) => void;
  onDropEvent: (eventId: string, dateKey: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const key = toDateKey(date);
  const specialDates = specialDatesFor(date);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(key)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onSelect(key);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={(event) => {
        event.preventDefault();
        const eventId = event.dataTransfer.getData("text/plain");
        if (eventId) onDropEvent(eventId, key);
      }}
      className={cn(
        "min-h-32 border-b border-r border-[var(--tenant-line)] p-2 text-left align-top transition duration-200 ease-out hover:bg-[var(--tenant-surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
        currentMonth === false && "bg-[var(--tenant-surface-muted)]/45 text-[var(--color-muted-foreground)]",
        selected && "outline outline-2 outline-primary outline-offset-[-2px]",
        dragOver && "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,var(--tenant-surface))] ring-2 ring-primary ring-inset",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{date.getDate()}</span>
        {events.length > 0 ? (
          <span className="rounded-full bg-[var(--tenant-surface-muted)] px-2 py-0.5 font-mono text-[10px] text-[var(--tenant-surface-foreground)]">
            {events.length}
          </span>
        ) : null}
      </div>
      {specialDates.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1">
          {specialDates.slice(0, 2).map((item) => (
            <span key={item.label} className="rounded-full border border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--tenant-wine)]">
              {item.label}
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function AgendaCalendar({ initialMonth, events }: AgendaCalendarProps) {
  const [localEvents, setLocalEvents] = useState(events);
  const [view, setView] = useState<CalendarView>("month");
  const [month, setMonth] = useState(() => new Date(`${initialMonth}-01T12:00:00`));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const days = useMemo(() => buildCalendarDays(month), [month]);
  const weekDays = useMemo(() => buildWeekDays(parseDateKey(selectedDate)), [selectedDate]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const event of localEvents) {
      const key = event.start.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), event]);
    }
    for (const dayEvents of map.values()) {
      dayEvents.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    }
    return map;
  }, [localEvents]);

  const selectedEvents = eventsByDay.get(selectedDate) ?? [];
  const weekStart = weekDays[0];
  const weekEnd = weekDays[6];
  const periodLabel = view === "month"
    ? monthLabel(month)
    : `${shortDate(weekStart)} - ${shortDate(weekEnd)} de ${weekEnd.getFullYear()}`;

  function changePeriod(offset: number) {
    if (view === "month") {
      setMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
      return;
    }
    const next = parseDateKey(selectedDate);
    next.setDate(next.getDate() + offset * 7);
    setSelectedDate(toDateKey(next));
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  function goToday() {
    const today = new Date();
    setSelectedDate(toDateKey(today));
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }

  function handleDrop(eventId: string, dateKey: string) {
    setDragOverDate(null);
    const previous = localEvents;
    setLocalEvents((current) => current.map((event) => (event.id === eventId ? updateEventDate(event, dateKey) : event)));

    startTransition(async () => {
      try {
        await rescheduleAgendaEvent(eventId, dateKey);
      } catch {
        setLocalEvents(previous);
      }
    });
  }

  function handleSelect(dateKey: string) {
    setSelectedDate(dateKey);
    const date = parseDateKey(dateKey);
    if (date.getMonth() !== month.getMonth()) {
      setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--tenant-surface-foreground)]">Agenda</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--color-muted-foreground)]">
            Prazos, audiencias e compromissos do escritorio com remarcacao por arraste, feriados e responsaveis por cor.
          </p>
        </div>
        <Badge className="rounded-full bg-[color-mix(in_srgb,var(--tenant-moss)_14%,transparent)] text-[var(--tenant-moss)]">
          {localEvents.length} evento{localEvents.length === 1 ? "" : "s"} no periodo
        </Badge>
      </header>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                aria-label="Periodo anterior"
                onClick={() => changePeriod(-1)}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-52 text-center font-display text-xl font-bold capitalize text-[var(--tenant-surface-foreground)]">
                {periodLabel}
              </h2>
              <Button
                variant="outline"
                size="sm"
                aria-label="Proximo periodo"
                onClick={() => changePeriod(1)}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToday}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]"
              >
                Hoje
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-1">
                {(["month", "week"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setView(option)}
                    className={cn(
                      "rounded px-3 py-1.5 text-sm font-medium text-[var(--color-muted-foreground)] transition-colors",
                      view === option && "bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] shadow-sm",
                    )}
                  >
                    {option === "month" ? "Mes" : "Semana"}
                  </button>
                ))}
              </div>
              {isPending ? (
                <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Salvando...</span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-[var(--color-muted-foreground)]">
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-wine)]" />Prazo</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-brass)]" />Audiencia</span>
            <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[var(--tenant-moss)]" />Reuniao</span>
            <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />Feriados e datas especiais</span>
          </div>

          {view === "month" ? (
            <div className="overflow-hidden rounded-lg border border-[var(--tenant-line)]">
              <div className="grid grid-cols-7 bg-[var(--tenant-surface-muted)] text-center text-[11px] font-semibold uppercase text-[var(--tenant-surface-foreground)]">
                {weekdays.map((day) => <div key={day} className="p-3">{day}</div>)}
              </div>
              <div className="grid grid-cols-7 bg-[var(--tenant-surface)]">
                {days.map((date) => {
                  const key = toDateKey(date);
                  const dayEvents = eventsByDay.get(key) ?? [];
                  return (
                    <DayShell
                      key={key}
                      date={date}
                      currentMonth={date.getMonth() === month.getMonth()}
                      selected={selectedDate === key}
                      dragOver={dragOverDate === key}
                      events={dayEvents}
                      onSelect={handleSelect}
                      onDropEvent={handleDrop}
                      className="min-h-32"
                    >
                      <div
                        className="mt-2 space-y-1"
                        onDragEnter={() => setDragOverDate(key)}
                        onDragLeave={() => setDragOverDate(null)}
                      >
                        {dayEvents.slice(0, 3).map((event) => (
                          <EventPill key={event.id} event={event} compact />
                        ))}
                        {dayEvents.length > 3 ? (
                          <div className="rounded bg-[var(--tenant-surface-muted)] px-2 py-1 text-[11px] font-medium text-[var(--color-muted-foreground)]">
                            +{dayEvents.length - 3} eventos
                          </div>
                        ) : null}
                      </div>
                    </DayShell>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--tenant-line)]">
              <div className="grid grid-cols-7 bg-[var(--tenant-surface-muted)] text-center text-[11px] font-semibold uppercase text-[var(--tenant-surface-foreground)]">
                {weekHeader.map((day) => <div key={day} className="p-3">{day}</div>)}
              </div>
              <div className="grid min-h-[520px] grid-cols-7 bg-[var(--tenant-surface)]">
                {weekDays.map((date) => {
                  const key = toDateKey(date);
                  const dayEvents = eventsByDay.get(key) ?? [];
                  return (
                    <DayShell
                      key={key}
                      date={date}
                      selected={selectedDate === key}
                      dragOver={dragOverDate === key}
                      events={dayEvents}
                      onSelect={handleSelect}
                      onDropEvent={handleDrop}
                      className="min-h-[520px]"
                    >
                      <div
                        className="mt-3 space-y-2"
                        onDragEnter={() => setDragOverDate(key)}
                        onDragLeave={() => setDragOverDate(null)}
                      >
                        {dayEvents.length === 0 ? (
                          <div className="rounded border border-dashed border-[var(--tenant-line)] p-3 text-xs text-[var(--color-muted-foreground)]">
                            Solte um evento aqui
                          </div>
                        ) : null}
                        {dayEvents.map((event) => (
                          <EventPill key={event.id} event={event} />
                        ))}
                      </div>
                    </DayShell>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h2 className="font-display text-xl font-semibold">Eventos do dia</h2>
            <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
              {parseDateKey(selectedDate).toLocaleDateString("pt-BR")}
            </span>
          </div>
          {selectedEvents.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-5 text-sm text-[var(--color-muted-foreground)]">
              Nenhum evento neste dia. Arraste um card para esta data quando precisar remarcar.
            </div>
          ) : (
            <div className="space-y-3">
              {selectedEvents.map((event) => (
                <div key={event.id} className="rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--tenant-surface-foreground)]">{event.title}</p>
                      <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{event.processTitle ?? event.description ?? "Sem processo vinculado"}</p>
                      <div className="mt-2 flex items-center gap-2 text-xs font-medium text-[var(--color-muted-foreground)]">
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-cover bg-center font-mono text-[10px] font-bold text-white"
                          style={{
                            backgroundColor: event.responsibleColor,
                            backgroundImage: event.responsibleAvatarUrl ? `url(${event.responsibleAvatarUrl})` : undefined,
                          }}
                        >
                          {event.responsibleAvatarUrl ? null : initials(event.responsibleName)}
                        </span>
                        {event.responsibleName ?? "Sem responsavel definido"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={typeClass[event.type]}>{typeLabel[event.type]}</Badge>
                      <Badge variant="outline" className="gap-1 border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                        <Clock3 className="h-3 w-3" />
                        {formatTime(event.start)}
                      </Badge>
                      <Badge variant="outline" className="gap-1 border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)]">
                        <CalendarDays className="h-3 w-3" />
                        {event.source}
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
