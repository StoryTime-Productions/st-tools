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
import {
  dayLabel,
  rangeLabel,
  stepAnchor,
  timeLabel,
  visibleDays,
  type CalendarView,
} from "@/lib/calendar";
import type { CalendarHangout } from "@/lib/hangouts";
import type { CalendarCard } from "@/lib/hub";
import { HANGOUT_STATUS_LABEL } from "@/lib/hub-format";
import { cn } from "@/lib/utils";

const VIEWS: Array<{ value: CalendarView; label: string }> = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "day", label: "Day" },
  { value: "agenda", label: "Agenda" },
];

// A project's colour comes from its id, so it does not move when another project is added. The legend always
// shows the real colour, so a rare collision between two projects stays readable.
const PALETTE = [
  { chip: "bg-sky-100 text-sky-950 dark:bg-sky-950 dark:text-sky-100", dot: "bg-sky-500" },
  {
    chip: "bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  {
    chip: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  {
    chip: "bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  { chip: "bg-rose-100 text-rose-950 dark:bg-rose-950 dark:text-rose-100", dot: "bg-rose-500" },
  { chip: "bg-teal-100 text-teal-950 dark:bg-teal-950 dark:text-teal-100", dot: "bg-teal-500" },
];

function paletteFor(projectId: string) {
  const sum = [...projectId].reduce((total, character) => total + character.charCodeAt(0), 0);
  return PALETTE[sum % PALETTE.length];
}

const HANGOUT_COLOUR = "bg-fuchsia-100 text-fuchsia-950 dark:bg-fuchsia-950 dark:text-fuchsia-100";
const MARKERS_PER_DAY = 3;

const MONTH_CHIPS = 3;
// Month and week fill the screen below the toolbar instead of stopping after the last row.
const FILL = "md:min-h-[calc(100dvh-19rem)]";

const ALL = "all";
const HANGOUTS = "hangouts";

type Entry = { kind: "card"; card: CalendarCard } | { kind: "hangout"; hangout: CalendarHangout };

/** Confirmed hangouts first (earliest first), then cards, then possible dates, so real events are never pushed out. */
function rank(entry: Entry) {
  if (entry.kind === "card") return "1";
  return entry.hangout.startSlot ? `0${entry.hangout.startSlot}` : "2";
}

function entryTitle(entry: Entry) {
  return entry.kind === "card" ? entry.card.title : entry.hangout.title;
}

export function HubCalendar({
  cards,
  hangouts,
  today,
}: {
  cards: CalendarCard[];
  hangouts: CalendarHangout[];
  today: string;
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(today);
  const [projectId, setProjectId] = useState(ALL);
  const [selectedDay, setSelectedDay] = useState(today);

  const projects = [...new Map(cards.map((card) => [card.projectId, card.projectTitle]))]
    .map(([id, title]) => ({ id, title }))
    .sort((a, b) => a.title.localeCompare(b.title));
  const colourOf = new Map(projects.map((project) => [project.id, paletteFor(project.id)]));

  const byDay = new Map<string, Entry[]>();
  const add = (day: string, entry: Entry) => byDay.set(day, [...(byDay.get(day) ?? []), entry]);
  if (projectId === ALL || projectId === HANGOUTS) {
    for (const hangout of hangouts)
      for (const day of hangout.days) add(day, { kind: "hangout", hangout });
  }
  for (const card of cards) {
    if (projectId === ALL || card.projectId === projectId)
      add(card.dueDate, { kind: "card", card });
  }

  for (const [day, entries] of byDay) {
    byDay.set(
      day,
      [...entries].sort(
        (a, b) => rank(a).localeCompare(rank(b)) || entryTitle(a).localeCompare(entryTitle(b))
      )
    );
  }

  const days = visibleDays(view, anchor);
  const month = anchor.slice(0, 7);
  const item = (entry: Entry) =>
    entry.kind === "card" ? (
      <CalendarItem
        key={entry.card.id}
        card={entry.card}
        colour={colourOf.get(entry.card.projectId)!.chip}
      />
    ) : (
      <HangoutItem key={entry.hangout.id} hangout={entry.hangout} />
    );

  const step = (direction: 1 | -1) => {
    const next = stepAnchor(view, anchor, direction);
    setAnchor(next);
    setSelectedDay(next);
  };

  const openDay = (day: string) => {
    setAnchor(day);
    setView("day");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Previous"
            onClick={() => step(-1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setAnchor(today);
              setSelectedDay(today);
            }}
          >
            Today
          </Button>
          <Button
            type="button"
            size="icon"
            variant="outline"
            aria-label="Next"
            onClick={() => step(1)}
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
              <SelectItem value={HANGOUTS}>Hangouts</SelectItem>
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

      {projects.length > 0 || hangouts.length > 0 ? (
        <ul
          aria-label="Legend"
          className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
        >
          {hangouts.length > 0 ? (
            <>
              <li className="flex items-center gap-1.5">
                <Marker kind="hangout" /> Confirmed hangout
              </li>
              <li className="flex items-center gap-1.5">
                <Marker kind="candidate" /> Possible date
              </li>
            </>
          ) : null}
          {projects.map((project) => (
            <li key={project.id} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("size-2.5 shrink-0 rounded-[3px]", colourOf.get(project.id)!.dot)}
              />
              {project.title}
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <div className="min-w-0">
          {view === "month" ? (
            <>
              <MonthDots
                days={days}
                month={month}
                today={today}
                byDay={byDay}
                selectedDay={selectedDay}
                onSelect={setSelectedDay}
                colourOf={colourOf}
              />
              <div
                className={cn(
                  "border-border/70 hidden flex-col overflow-hidden rounded-2xl border text-xs md:flex",
                  FILL
                )}
              >
                <div className="grid grid-cols-7">
                  {days.slice(0, 7).map((day) => (
                    <div
                      key={day}
                      className="text-muted-foreground bg-muted/40 px-2 py-1 font-medium"
                    >
                      {dayLabel(day, { weekday: "short" })}
                    </div>
                  ))}
                </div>
                <div className="grid flex-1 auto-rows-fr grid-cols-7">
                  {days.map((day) => {
                    const entries = byDay.get(day) ?? [];
                    const hidden = entries.length - MONTH_CHIPS;
                    return (
                      <div
                        key={day}
                        aria-label={dayLabel(day, { month: "long", day: "numeric" })}
                        className={cn(
                          "border-border/70 min-h-20 min-w-0 space-y-1 border-t border-l p-1 first:border-l-0 [&:nth-child(7n+1)]:border-l-0",
                          !day.startsWith(month) && "bg-muted/30"
                        )}
                      >
                        <DayNumber day={day} today={today} muted={!day.startsWith(month)} />
                        {entries.slice(0, MONTH_CHIPS).map(item)}
                        {hidden > 0 ? (
                          <button
                            type="button"
                            onClick={() => openDay(day)}
                            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring w-full rounded-md px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none"
                          >
                            +{hidden} more
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : view === "agenda" ? (
            <AgendaList days={days.filter((day) => byDay.has(day))} byDay={byDay} item={item} />
          ) : (
            <div
              className={cn(
                "space-y-2",
                view === "week" && cn("md:grid md:auto-rows-fr md:gap-2 md:space-y-0", FILL)
              )}
            >
              {days.map((day) => (
                <section
                  key={day}
                  aria-label={dayLabel(day, { weekday: "long", month: "long", day: "numeric" })}
                  className={cn(
                    "border-border/70 min-w-0 gap-2 rounded-2xl border p-3 md:flex md:items-start md:gap-4",
                    day === today && "bg-muted/30"
                  )}
                >
                  <p
                    className={cn(
                      "text-xs font-medium md:w-28 md:shrink-0 md:pt-0.5",
                      day === today ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {dayLabel(day, { weekday: "short", month: "short", day: "numeric" })}
                  </p>
                  {byDay.has(day) ? (
                    <div className="grid min-w-0 flex-1 gap-1 md:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]">
                      {byDay.get(day)!.map(item)}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-xs">Nothing due</p>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function kindOf(entry: Entry): "card" | "hangout" | "candidate" {
  if (entry.kind === "card") return "card";
  return entry.hangout.startSlot ? "hangout" : "candidate";
}

/** The marker's meaning is always written next to it (legend and day sheet), never carried by shape or colour alone. */
function Marker({ kind, dot }: { kind: "card" | "hangout" | "candidate"; dot?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 shrink-0",
        kind === "card" && cn("rounded-[3px]", dot ?? "bg-muted-foreground"),
        kind === "hangout" && "rounded-full bg-fuchsia-500",
        kind === "candidate" && "rounded-full border-2 border-dashed border-fuchsia-500"
      )}
    />
  );
}

function MonthDots({
  days,
  month,
  today,
  byDay,
  selectedDay,
  onSelect,
  colourOf,
}: {
  days: string[];
  month: string;
  today: string;
  byDay: Map<string, Entry[]>;
  selectedDay: string;
  onSelect: (day: string) => void;
  colourOf: Map<string, { chip: string; dot: string }>;
}) {
  const entries = byDay.get(selectedDay) ?? [];

  return (
    <div className="space-y-4 md:hidden">
      <div className="grid grid-cols-7 gap-1">
        {days.slice(0, 7).map((day) => (
          <div key={day} className="text-muted-foreground py-1 text-center text-xs font-medium">
            {dayLabel(day, { weekday: "narrow" })}
          </div>
        ))}
        {days.map((day) => {
          const dayEntries = byDay.get(day) ?? [];
          const extra = dayEntries.length - MARKERS_PER_DAY;
          const isSelected = day === selectedDay;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${dayLabel(day, { month: "long", day: "numeric" })}, ${
                dayEntries.length === 0
                  ? "nothing planned"
                  : `${dayEntries.length} ${dayEntries.length === 1 ? "item" : "items"}`
              }`}
              onClick={() => onSelect(day)}
              className={cn(
                "border-border/70 focus-visible:ring-ring flex min-h-14 flex-col items-center gap-1.5 rounded-xl border px-0.5 pt-1.5 pb-1 text-sm focus-visible:ring-2 focus-visible:outline-none",
                !day.startsWith(month) && "text-muted-foreground bg-muted/30",
                isSelected && "bg-muted ring-foreground ring-2"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full",
                  day === today && "bg-primary text-primary-foreground"
                )}
              >
                {Number(day.slice(8))}
              </span>
              <span className="flex h-3 items-center gap-0.5" aria-hidden="true">
                {dayEntries.slice(0, MARKERS_PER_DAY).map((entry, index) => (
                  <Marker
                    key={index}
                    kind={kindOf(entry)}
                    dot={
                      entry.kind === "card" ? colourOf.get(entry.card.projectId)?.dot : undefined
                    }
                  />
                ))}
                {extra > 0 ? <span className="text-[10px] leading-none">+{extra}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      <section
        aria-labelledby="day-sheet-title"
        aria-live="polite"
        className="border-border/70 bg-background/85 rounded-2xl border p-4"
      >
        <h3 id="day-sheet-title" className="text-sm font-medium">
          {dayLabel(selectedDay, { weekday: "short", month: "short", day: "numeric" })}
          {" · "}
          {entries.length === 0
            ? "nothing planned"
            : `${entries.length} ${entries.length === 1 ? "item" : "items"}`}
        </h3>
        {entries.length > 0 ? (
          <ul className="divide-border/70 mt-2 divide-y">
            {entries.map((entry) => (
              <li key={entry.kind === "card" ? entry.card.id : `${entry.hangout.id}`}>
                <SheetRow entry={entry} colourOf={colourOf} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function SheetRow({
  entry,
  colourOf,
}: {
  entry: Entry;
  colourOf: Map<string, { chip: string; dot: string }>;
}) {
  if (entry.kind === "card") {
    const { card } = entry;
    return (
      <Link
        href={`/boards/${card.boardId}?card=${card.id}`}
        className="focus-visible:ring-ring flex min-h-11 items-start gap-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="text-muted-foreground w-16 shrink-0 pt-0.5 text-xs">Due</span>
        <span className="min-w-0 flex-1 text-sm">
          <span className="flex items-center gap-2">
            <Marker kind="card" dot={colourOf.get(card.projectId)?.dot} />
            <span className={cn("break-words", card.finished && "line-through")}>{card.title}</span>
          </span>
          <span className="text-muted-foreground block text-xs">
            Card due · {card.projectTitle}
            {card.finished ? " · Finished" : ""}
          </span>
        </span>
      </Link>
    );
  }

  const { hangout } = entry;
  const time = hangout.startSlot?.slice(11);
  return (
    <Link
      href={`/hub/hangouts/${hangout.id}`}
      className="focus-visible:ring-ring flex min-h-11 items-start gap-3 py-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="text-muted-foreground w-16 shrink-0 pt-0.5 text-xs">
        {time ? timeLabel(time) : "Possible"}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="flex items-center gap-2">
          <Marker kind={time ? "hangout" : "candidate"} />
          <span className="break-words">{hangout.title}</span>
        </span>
        <span className="text-muted-foreground block text-xs">
          {time
            ? `Confirmed hangout · ${hangout.goingCount} going`
            : `Possible date · one of ${hangout.days.length}`}
        </span>
      </span>
    </Link>
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
  byDay: Map<string, Entry[]>;
  item: (entry: Entry) => React.ReactNode;
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
            "focus-visible:ring-ring block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none md:break-words md:whitespace-normal",
            colour,
            card.finished && "line-through"
          )}
        >
          {card.title}
          {card.finished ? <span className="sr-only"> (finished)</span> : null}
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

function HangoutItem({ hangout }: { hangout: CalendarHangout }) {
  const time = hangout.startSlot?.slice(11);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "focus-visible:ring-ring block w-full truncate rounded-md px-1.5 py-0.5 text-left text-xs focus-visible:ring-2 focus-visible:outline-none md:break-words md:whitespace-normal",
            time
              ? HANGOUT_COLOUR
              : "text-muted-foreground border border-dashed border-fuchsia-400 dark:border-fuchsia-700"
          )}
        >
          {time ? `${timeLabel(time)} ` : ""}
          {hangout.title}
        </button>
      </PopoverTrigger>
      <PopoverContent aria-label={hangout.title} className="w-72 space-y-2 text-sm">
        <p className="font-medium">{hangout.title}</p>
        <Badge variant="secondary">{HANGOUT_STATUS_LABEL[hangout.status]}</Badge>
        {time ? (
          <p className="text-xs">
            {dayLabel(hangout.days[0], { weekday: "short", month: "long", day: "numeric" })},{" "}
            {timeLabel(time)} EST · {hangout.goingCount} going
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            One of {hangout.days.length} candidate dates
          </p>
        )}
        <Button asChild size="sm" className="w-full">
          <Link href={`/hub/hangouts/${hangout.id}`}>Open hangout</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
