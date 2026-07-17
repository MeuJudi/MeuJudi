"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock3, GripVertical, ListChecks, Sparkles, X } from "lucide-react";
import { createInternalReminderFromAgendaEvent, rescheduleAgendaEvent } from "./actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProcessDetailsModal } from "@/components/tenant/process-details-modal";
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
  processId: string | null;
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
type MovePolicy = "direct" | "confirm" | "locked";
type PendingDrop = {
  event: AgendaItem;
  dateKey: string;
  policy: MovePolicy;
};

const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const weekHeader = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
const weekHours = Array.from({ length: 11 }, (_, index) => index + 8);

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

function isToday(date: Date) {
  return toDateKey(date) === toDateKey(new Date());
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

function getMovePolicy(event: AgendaItem): MovePolicy {
  if (event.source !== "manual" && (event.type === "audiencia" || event.type === "prazo")) {
    return "locked";
  }

  if (event.source !== "manual" || event.type === "audiencia" || event.type === "prazo") {
    return "confirm";
  }

  return "direct";
}

function policyTitle(policy: MovePolicy, event: AgendaItem) {
  if (policy === "locked") return "Data oficial protegida";
  if (event.type === "audiencia") return "Confirmar alteracao de audiencia";
  if (event.type === "prazo") return "Confirmar alteracao de prazo";
  return "Confirmar alteracao sensivel";
}

function policyMessage(policy: MovePolicy, event: AgendaItem) {
  if (policy === "locked") {
    return "Este evento veio de uma fonte oficial do processo. O MeuJudi nao deve alterar a data original, porque isso nao muda a data no tribunal. O caminho seguro e criar um lembrete interno na nova data.";
  }

  if (event.type === "audiencia") {
    return "Audiencias normalmente dependem do tribunal. Mover este card altera somente a agenda interna do escritorio, nao a data oficial do processo.";
  }

  if (event.type === "prazo") {
    return "Prazos processuais precisam de cuidado. Mover este card altera somente a agenda interna do escritorio. Confirme apenas se voce esta corrigindo uma data interna.";
  }

  return "Este evento veio de uma integracao ou fonte externa. Confirme se a mudanca representa apenas uma organizacao interna do escritorio.";
}

function EventPill({
  event,
  compact = false,
  onOpenProcess,
}: {
  event: AgendaItem;
  compact?: boolean;
  onOpenProcess?: (processId: string) => void;
}) {
  const policy = getMovePolicy(event);
  return (
    <div
      draggable
      onDragStart={(dragEvent) => {
        dragEvent.dataTransfer.setData("text/plain", event.id);
        dragEvent.dataTransfer.effectAllowed = "move";
      }}
      className={cn(
        "group flex cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] shadow-sm transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing",
        event.processId && "cursor-pointer",
        policy === "locked" && "cursor-copy",
        typeClass[event.type],
      )}
      title={policy === "locked" ? "Arraste para criar lembrete interno" : "Arraste para remarcar"}
      onClick={(clickEvent) => {
        if (!event.processId) return;
        clickEvent.stopPropagation();
        onOpenProcess?.(event.processId);
      }}
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

function WeekEventCard({ event, onOpenProcess }: { event: AgendaItem; onOpenProcess?: (processId: string) => void }) {
  const start = new Date(event.start);
  const hour = start.getHours();
  const minute = start.getMinutes();
  const rowStart = Math.max(1, Math.min(weekHours.length, hour - weekHours[0] + 1));
  const topOffset = Math.round((minute / 60) * 46);

  return (
    <div
      className="absolute left-2 right-2 z-10"
      style={{ top: `${(rowStart - 1) * 56 + topOffset + 6}px` }}
    >
      <EventPill event={event} onOpenProcess={onOpenProcess} />
    </div>
  );
}

function MoveGuardModal({
  pendingDrop,
  isPending,
  onCancel,
  onConfirmMove,
  onCreateReminder,
}: {
  pendingDrop: PendingDrop;
  isPending: boolean;
  onCancel: () => void;
  onConfirmMove: () => void;
  onCreateReminder: () => void;
}) {
  const targetDate = parseDateKey(pendingDrop.dateKey).toLocaleDateString("pt-BR");
  const isLocked = pendingDrop.policy === "locked";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-xl rounded-lg border border-[var(--tenant-line)] bg-[var(--tenant-surface)] p-5 text-[var(--tenant-surface-foreground)] shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--tenant-wine)_12%,transparent)] text-[var(--tenant-wine)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold">{policyTitle(pendingDrop.policy, pendingDrop.event)}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
                {policyMessage(pendingDrop.policy, pendingDrop.event)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--tenant-surface-muted)] hover:text-[var(--tenant-brass)]"
            aria-label="Fechar aviso"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-md border border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)] p-3">
          <p className="text-sm font-semibold">{pendingDrop.event.title}</p>
          <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            Origem: {pendingDrop.event.source} · Tipo: {typeLabel[pendingDrop.event.type]} · Nova data: {targetDate}
          </p>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
            className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]"
          >
            Cancelar
          </Button>
          {isLocked ? (
            <Button type="button" onClick={onCreateReminder} disabled={isPending}>
              Criar lembrete interno
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={onCreateReminder}
                disabled={isPending}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-surface-foreground)] hover:bg-[var(--tenant-surface-muted)]"
              >
                Criar lembrete interno
              </Button>
              <Button type="button" onClick={onConfirmMove} disabled={isPending}>
                Mover mesmo assim
              </Button>
            </>
          )}
        </div>
      </div>
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
  const today = isToday(date);

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
        today && "bg-[color-mix(in_srgb,var(--tenant-brass)_7%,var(--tenant-surface))]",
        currentMonth === false && "bg-[var(--tenant-surface-muted)]/45 text-[var(--color-muted-foreground)]",
        selected && "outline outline-2 outline-primary outline-offset-[-2px]",
        dragOver && "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,var(--tenant-surface))] ring-2 ring-primary ring-inset",
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono text-xs font-semibold",
            today && "border border-[var(--tenant-brass)] bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm",
          )}
        >
          {date.getDate()}
        </span>
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
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
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

  function commitMove(event: AgendaItem, dateKey: string, confirmSensitive: boolean) {
    const previous = localEvents;
    setLocalEvents((current) => current.map((item) => (item.id === event.id ? updateEventDate(item, dateKey) : item)));

    startTransition(async () => {
      try {
        await rescheduleAgendaEvent(event.id, dateKey, confirmSensitive);
        setPendingDrop(null);
      } catch {
        setLocalEvents(previous);
      }
    });
  }

  function createReminder(event: AgendaItem, dateKey: string) {
    startTransition(async () => {
      try {
        const reminder = await createInternalReminderFromAgendaEvent(event.id, dateKey);
        setLocalEvents((current) => [...current, reminder]);
        setSelectedDate(dateKey);
        setPendingDrop(null);
      } catch {
        setPendingDrop(null);
      }
    });
  }

  function handleDrop(eventId: string, dateKey: string) {
    setDragOverDate(null);
    const event = localEvents.find((item) => item.id === eventId);
    if (!event) return;

    const policy = getMovePolicy(event);
    if (policy === "direct") {
      commitMove(event, dateKey, false);
      return;
    }

    setPendingDrop({ event, dateKey, policy });
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
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-brass)] hover:bg-[var(--tenant-brass)] hover:text-[var(--tenant-surface)]"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 className="min-w-52 text-center font-display text-xl font-bold capitalize text-[var(--tenant-brass)]">
                {periodLabel}
              </h2>
              <Button
                variant="outline"
                size="sm"
                aria-label="Proximo periodo"
                onClick={() => changePeriod(1)}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-brass)] hover:bg-[var(--tenant-brass)] hover:text-[var(--tenant-surface)]"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToday}
                className="border-[var(--tenant-line)] bg-[var(--tenant-surface)] text-[var(--tenant-brass)] hover:bg-[var(--tenant-brass)] hover:text-[var(--tenant-surface)]"
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
                      view === option && "bg-[var(--tenant-surface)] text-[var(--tenant-brass)] shadow-sm",
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
                          <EventPill key={event.id} event={event} compact onOpenProcess={setSelectedProcessId} />
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
            <div className="overflow-x-auto rounded-lg border border-[var(--tenant-line)]">
              <div className="grid grid-cols-[64px_repeat(7,minmax(150px,1fr))] bg-[var(--tenant-surface-muted)] text-center text-[11px] font-semibold uppercase text-[var(--tenant-surface-foreground)]">
                <div className="border-r border-[var(--tenant-line)] p-3 text-left">Hora</div>
                {weekHeader.map((day, index) => {
                  const date = weekDays[index];
                  return (
                    <div key={day} className="border-r border-[var(--tenant-line)] p-3">
                      <span>{day}</span>
                      <span
                        className={cn(
                          "ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-mono",
                          isToday(date) && "border border-[var(--tenant-brass)] bg-[var(--tenant-surface)] text-[var(--tenant-brass)]",
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="grid grid-cols-[64px_repeat(7,minmax(150px,1fr))] bg-[var(--tenant-surface)]">
                <div className="border-r border-[var(--tenant-line)] bg-[var(--tenant-surface-muted)]/40">
                  {weekHours.map((hour) => (
                    <div key={hour} className="h-14 border-b border-[var(--tenant-line)] px-2 py-1 text-right font-mono text-[11px] text-[var(--color-muted-foreground)]">
                      {String(hour).padStart(2, "0")}:00
                    </div>
                  ))}
                </div>
                {weekDays.map((date) => {
                  const key = toDateKey(date);
                  const dayEvents = eventsByDay.get(key) ?? [];
                  return (
                    <div
                      key={key}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelect(key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") handleSelect(key);
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const eventId = event.dataTransfer.getData("text/plain");
                        if (eventId) handleDrop(eventId, key);
                      }}
                      className={cn(
                        "relative min-h-[616px] border-r border-[var(--tenant-line)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                        isToday(date) && "bg-[color-mix(in_srgb,var(--tenant-brass)_6%,var(--tenant-surface))]",
                        selectedDate === key && "outline outline-2 outline-primary outline-offset-[-2px]",
                        dragOverDate === key && "bg-[color-mix(in_srgb,var(--tenant-brass)_14%,var(--tenant-surface))] ring-2 ring-primary ring-inset",
                      )}
                    >
                      {weekHours.map((hour) => (
                        <div key={hour} className="h-14 border-b border-[var(--tenant-line)]" />
                      ))}
                      <div onDragEnter={() => setDragOverDate(key)} onDragLeave={() => setDragOverDate(null)}>
                        {dayEvents.map((event) => <WeekEventCard key={event.id} event={event} onOpenProcess={setSelectedProcessId} />)}
                        {dayEvents.length === 0 ? (
                          <span className="absolute left-2 top-2 rounded border border-dashed border-[var(--tenant-line)] bg-[var(--tenant-surface)] px-2 py-1 text-xs text-[var(--color-muted-foreground)]">
                            Solte aqui
                          </span>
                        ) : null}
                      </div>
                    </div>
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
                      {event.processId ? (
                        <button
                          type="button"
                          onClick={() => setSelectedProcessId(event.processId)}
                          className="mt-1 text-left text-sm text-[var(--color-muted-foreground)] underline-offset-2 hover:underline"
                        >
                          {event.processTitle ?? event.description ?? "Processo vinculado"}
                        </button>
                      ) : (
                        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{event.description ?? "Sem processo vinculado"}</p>
                      )}
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

      {pendingDrop ? (
        <MoveGuardModal
          pendingDrop={pendingDrop}
          isPending={isPending}
          onCancel={() => setPendingDrop(null)}
          onConfirmMove={() => commitMove(pendingDrop.event, pendingDrop.dateKey, true)}
          onCreateReminder={() => createReminder(pendingDrop.event, pendingDrop.dateKey)}
        />
      ) : null}
      <ProcessDetailsModal processId={selectedProcessId} onClose={() => setSelectedProcessId(null)} />
    </div>
  );
}
