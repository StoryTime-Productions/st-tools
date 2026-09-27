"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { dayLabel, rangeLabel, stepAnchor, visibleDays, type CalendarView } from "@/lib/calendar";
import type { CalendarCard } from "@/lib/hub";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ value: CalendarView; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

// ponytail: 6 colours cycle by project title order; add more if projects collide visibly.
const PALETTE = [
  "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
  "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
  "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
  "bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
  "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100",
  "bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-100",
];

const ALL = "all";

export function HubCalendar({ cards, today }: { cards: CalendarCard[]; today: string }) {
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(today);
  const [projectId, setProjectId] = useState(ALL);

  const projects = [...new Map(cards.map((card) => [card.projectId, card.projectTitle]))]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const colourOf = new Map(
    projects.map((project, index) => [project.id, PALETTE[index % PALETTE.length]])
  );

  const byDay = new Map<string, CalendarCard[]>();
  for (const card of cards) {
    if (projectId !== ALL && card.projectId !== projectId) continue;
    byDay.set(card.dueDate, [...(byDay.get(card.dueDate) ?? []), card]);
  }

  const days = visibleDays(view, anchor);
  const month = anchor.slice(0, 7);
  const item = (card: CalendarCard) => (
    <CalendarItem key={card.id} card={card} colour={colourOf.get(card.projectId)!} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Previous"
            onClick={() => setAnchor(stepAnchor(view, anchor, -1))}
          >
            <ChevronLeft />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setAnchor(today)}>
            Today
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Next"
            onClick={() => setAnchor(stepAnchor(view, anchor, 1))}
          >
            <ChevronRight />
          </Button>
          <h2 className="ml-1 text-base font-medium">{rangeLabel(view, anchor)}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger className="w-44" aria-label="Project">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div role="group" aria-label="View" className="bg-muted inline-flex rounded-xl p-1">
            {VIEWS.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={view === option.value ? "default" : "ghost"}
                aria-pressed={view === option.value}
                onClick={() => setView(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {projects.length > 0 ? (
        <ul aria-label="Projects" className="flex flex-wrap gap-2 text-xs">
          {projects.map((project) => (
            <li key={project.id} className={cn("rounded-md px-2 py-0.5", colourOf.get(project.id))}>
              {project.title}
            </li>
          ))}
        </ul>
      ) : null}

      {view === "month" ? (
        <div className="border-border/70 grid grid-cols-7 overflow-hidden rounded-2xl border text-xs">
          {days.slice(0, 7).map((day) => (
            <div key={day} className="text-muted-foreground bg-muted/40 px-2 py-1 font-medium">
              {dayLabel(day, { weekday: "short" })}
            </div>
          ))}
          {days.map((day) => (
            <div
              key={day}
              aria-label={dayLabel(day, { month: "long", day: "numeric" })}
              className={cn(
                "border-border/70 min-h-20 min-w-0 space-y-1 border-t p-1",
                !day.startsWith(month) && "bg-muted/30"
              )}
            >
              <DayNumber day={day} today={today} muted={!day.startsWith(month)} />
              {(byDay.get(day) ?? []).map(item)}
            </div>
          ))}
        </div>
      ) : view === "agenda" ? (
        <AgendaList days={days.filter((day) => byDay.has(day))} byDay={byDay} item={item} />
      ) : (
        <div className={cn("grid gap-3", view === "week" && "md:grid-cols-7")}>
          {days.map((day) => (
            <section
              key={day}
              aria-label={dayLabel(day, { weekday: "long", month: "long", day: "numeric" })}
              className="border-border/70 min-w-0 space-y-1 rounded-2xl border p-2"
            >
              <p
                className={cn(
                  "text-xs font-medium",
                  day === today ? "text-primary" : "text-muted-foreground"
                )}
              >
                {dayLabel(day, { weekday: "short", month: "short", day: "numeric" })}
              </p>
              {(byDay.get(day) ?? []).map(item)}
              {byDay.has(day) ? null : <p className="text-muted-foreground text-xs">Nothing due</p>}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function DayNumber({ day, today, muted }: { day: string; today: string; muted: boolean }) {
  return (
    <p
      className={cn(
        "flex size-6 items-center justify-center rounded-full",
        day === today ? "bg-primary text-primary-foreground" : muted && "text-muted-foreground"
      )}
    >
      {Number(day.slice(8))}
    </p>
  );
}

function AgendaList({
  days,
  byDay,
  item,
}: {
  days: string[];
  byDay: Map<string, CalendarCard[]>;
  item: (card: CalendarCard) => React.ReactNode;
}) {
  if (days.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing due this month.</p>;
  }
  return (
    <ol className="space-y-4">
      {days.map((day) => (
        <li key={day} className="space-y-1">
          <p className="text-muted-foreground text-xs font-medium">
            {dayLabel(day, { weekday: "long", month: "long", day: "numeric" })}
          </p>
          {byDay.get(day)!.map(item)}
        </li>
      ))}
    </ol>
  );
}

function CalendarItem({ card, colour }: { card: CalendarCard; colour: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "focus-visible:ring-ring block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none",
            colour,
            card.finished && "line-through opacity-75"
          )}
        >
          {card.title}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={card.title} className="w-72 space-y-2 text-sm">
        <p className="font-medium">{card.title}</p>
        <p className="text-muted-foreground text-xs">
          {card.projectTitle} · {card.boardTitle}
        </p>
        <p className="text-xs">
          Due {dayLabel(card.dueDate, { month: "long", day: "numeric", year: "numeric" })}
          {" · "}
          {card.assigneeName ?? "Unassigned"}
        </p>
        {card.finished ? <Badge variant="outline">Finished</Badge> : null}
        <Button asChild size="sm" className="w-full">
          <Link href={`/boards/${card.boardId}?card=${card.id}`}>Open card</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
