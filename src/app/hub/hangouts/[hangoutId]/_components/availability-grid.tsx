"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type PointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveAvailabilityAction } from "@/app/actions/hangouts";
import {
  SLOT_MINUTES,
  slotTimes,
  type AvailabilityResponse,
  type AvailabilityWindow,
} from "@/lib/availability";
import { dayLabel, hourLabel, timeLabel } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Cell = [day: number, row: number];

interface Drag {
  mode: boolean;
  from: Cell;
  to: Cell;
}

const MAX_UNPAGED_DAYS = 5;
// A touch rests this long on a Group cell before it starts a range, so swiping still scrolls the page.
const HOLD_MS = 250;

type View = "mine" | "group";
interface Selection {
  from: Cell;
  to: Cell;
}

function slotEnd(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes + SLOT_MINUTES;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Groups date keys (sorted) by Monday-start calendar week; `days` are indexes into `dates`. */
function weekGroups(dates: string[]) {
  const monday = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return date.toISOString().slice(0, 10);
  };
  const groups: { start: string; days: number[] }[] = [];
  dates.forEach((day, index) => {
    const start = monday(day);
    const last = groups[groups.length - 1];
    if (last?.start === start) last.days.push(index);
    else groups.push({ start, days: [index] });
  });
  return groups;
}

function weekLabel(first: string, last: string, year = false) {
  const format = {
    month: "short",
    day: "numeric",
    ...(year && { year: "numeric" as const }),
  } as const;
  return first === last
    ? dayLabel(first, format)
    : `${dayLabel(first, format)} – ${dayLabel(last, format)}`;
}

function slotLabel(day: string, time: string) {
  return `${dayLabel(day, { weekday: "short", month: "short", day: "numeric" })}, ${timeLabel(time)}`;
}

export function AvailabilityGrid({
  hangoutId,
  setup: { dates, startHour, endHour },
  user,
  responses,
  editable,
}: {
  hangoutId: string;
  setup: AvailabilityWindow;
  user: { id: string; name: string };
  responses: AvailabilityResponse[];
  editable: boolean;
}) {
  const times = slotTimes(startHour, endHour);
  const multiYear = dates[0]?.slice(0, 4) !== dates[dates.length - 1]?.slice(0, 4);
  const key = ([day, row]: Cell) => `${dates[day]}T${times[row]}`;

  const [mine, setMine] = useState(
    () => new Set(responses.find((response) => response.userId === user.id)?.slots)
  );
  const weeks = weekGroups(dates);
  const paged = dates.length > MAX_UNPAGED_DAYS;
  const [weekAt, setWeek] = useState(0);
  const week = Math.min(weekAt, weeks.length - 1);
  const visible = paged ? weeks[week].days : dates.map((_, index) => index);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [view, setView] = useState<View>(editable ? "mine" : "group");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  function save(next: Set<string>) {
    const previous = mine;
    setMine(next);
    startTransition(async () => {
      const result = await saveAvailabilityAction({ hangoutId, slots: [...next].sort() });
      if ("error" in result) {
        toast.error(result.error);
        setMine(previous);
      }
    });
  }

  function inDrag([day, row]: Cell) {
    if (!drag) return false;
    const [d1, r1] = drag.from;
    const [d2, r2] = drag.to;
    return (
      day >= Math.min(d1, d2) &&
      day <= Math.max(d1, d2) &&
      row >= Math.min(r1, r2) &&
      row <= Math.max(r1, r2)
    );
  }

  useEffect(() => {
    if (!drag) return;
    function finish() {
      const next = new Set(mine);
      times.forEach((_, row) =>
        dates.forEach((_, day) => {
          if (!inDrag([day, row])) return;
          if (drag!.mode) next.add(key([day, row]));
          else next.delete(key([day, row]));
        })
      );
      setDrag(null);
      save(next);
    }
    const cancel = () => setDrag(null);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  });

  useEffect(() => {
    if (!selecting) return;
    const finish = () => {
      setSelecting(false);
      setPinned(true);
      setAnnouncement(summary);
    };
    const cancel = () => setSelecting(false);
    // Once a range has started, the finger must not scroll the page.
    const hold = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("touchmove", hold, { passive: false });
    return () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("touchmove", hold);
    };
  });

  // A touch that scrolls or lifts before the hold elapses must not start a range.
  useEffect(() => {
    const stop = () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
      holdTimer.current = null;
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      stop();
    };
  }, []);

  function clearHold() {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  }

  function switchView(next: View) {
    clearHold();
    setView(next);
    setSelection(null);
    setSelecting(false);
    setPinned(false);
    setAnnouncement("");
  }

  function startSelect(cell: Cell, event: PointerEvent<HTMLButtonElement>) {
    const begin = () => {
      setSelection({ from: cell, to: cell });
      setSelecting(true);
      setPinned(false);
    };
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (event.pointerType === "touch") {
      clearHold();
      holdTimer.current = setTimeout(begin, HOLD_MS);
      return;
    }
    event.preventDefault();
    begin();
  }

  function moveSelect(event: PointerEvent<HTMLDivElement>) {
    if (!selecting) return;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-cell]")
      ?.dataset.cell?.split(":")
      .map(Number) as Cell | undefined;
    if (cell) setSelection((current) => (current ? { ...current, to: cell } : current));
  }

  function startDrag(cell: Cell, event: PointerEvent<HTMLButtonElement>) {
    if (!editable) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    setDrag({ mode: !mine.has(key(cell)), from: cell, to: cell });
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const cell = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-cell]")
      ?.dataset.cell?.split(":")
      .map(Number) as Cell | undefined;
    if (cell && (cell[0] !== drag.to[0] || cell[1] !== drag.to[1])) setDrag({ ...drag, to: cell });
  }

  const people = [
    ...responses.filter((response) => response.userId !== user.id),
    ...(mine.size > 0 ? [{ userId: user.id, name: user.name, slots: [...mine] }] : []),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const freeAt = new Map<string, Set<string>>();
  for (const person of people) {
    for (const slot of person.slots)
      freeAt.set(slot, (freeAt.get(slot) ?? new Set()).add(person.userId));
  }

  function grid(renderCell: (cell: Cell, slot: string) => ReactNode, onMove?: typeof moveDrag) {
    return (
      <div className="overflow-x-auto">
        <div
          className="grid min-w-fit select-none"
          style={{ gridTemplateColumns: `auto repeat(${visible.length}, minmax(2.75rem, 1fr))` }}
          onPointerMove={onMove}
        >
          <span />
          {visible.map((index) => (
            <span key={dates[index]} className="pb-1 text-center text-xs leading-tight">
              <span className="text-muted-foreground block">
                {dayLabel(dates[index], { weekday: "short" })}
              </span>
              {dayLabel(dates[index], {
                month: "short",
                day: "numeric",
                ...(multiYear && { year: "numeric" as const }),
              })}
            </span>
          ))}
          {times.flatMap((time, row) => [
            <span
              key={time}
              className="text-muted-foreground -mt-1.5 pr-2 text-right text-[10px] leading-none"
            >
              {time.endsWith(":00") ? hourLabel(Number(time.slice(0, 2))) : ""}
            </span>,
            ...visible.map((index) => renderCell([index, row], `${dates[index]}T${time}`)),
          ])}
        </div>
      </div>
    );
  }

  const green = "[--avail:var(--color-green-500)] dark:[--avail:var(--color-green-400)]";
  const cellClass = (row: number) =>
    cn(
      green,
      "focus-visible:ring-ring h-4 border-l border-t focus-visible:ring-2 focus-visible:outline-none",
      row % 4 === 0 ? "border-t-border" : "border-t-border/30"
    );

  const box = selection && {
    d1: Math.min(selection.from[0], selection.to[0]),
    d2: Math.max(selection.from[0], selection.to[0]),
    r1: Math.min(selection.from[1], selection.to[1]),
    r2: Math.max(selection.from[1], selection.to[1]),
  };
  const inSelection = ([day, row]: Cell) =>
    !!box && day >= box.d1 && day <= box.d2 && row >= box.r1 && row <= box.r2;
  const selectedSlots = box
    ? dates
        .slice(box.d1, box.d2 + 1)
        .flatMap((day) => times.slice(box.r1, box.r2 + 1).map((time) => `${day}T${time}`))
    : [];
  const freeIds = new Set(
    people
      .filter((person) => selectedSlots.every((slot) => freeAt.get(slot)?.has(person.userId)))
      .map((person) => person.userId)
  );
  const names = (free: boolean) =>
    people
      .filter((person) => freeIds.has(person.userId) === free)
      .map((person) => person.name)
      .join(", ") || "Nobody";
  const isRange = selectedSlots.length > 1;
  const shortDay = (index: number) =>
    dayLabel(dates[index], { weekday: "short", month: "short", day: "numeric" });
  const selectionLabel = box
    ? isRange
      ? `${box.d1 === box.d2 ? shortDay(box.d1) : `${shortDay(box.d1)} – ${shortDay(box.d2)}`}, ${timeLabel(times[box.r1])}–${timeLabel(slotEnd(times[box.r2]))} (${selectedSlots.length} slots)`
      : slotLabel(dates[box.d1], times[box.r1])
    : "";
  const count = `${freeIds.size} of ${people.length} free`;
  const summary = box ? `${selectionLabel}: ${count}${isRange ? " for the whole range" : ""}` : "";

  function selectSingle(cell: Cell, nextPinned: boolean) {
    if (selecting) return;
    setSelection({ from: cell, to: cell });
    setPinned(nextPinned);
  }

  return (
    <div
      className={cn(
        "grid gap-4 lg:gap-6",
        view === "group" && "pb-40 lg:grid-cols-[1fr_13rem] lg:pb-0"
      )}
    >
      <div className="flex items-center justify-between gap-2 lg:col-span-full">
        <div role="group" aria-label="View" className="inline-flex rounded-xl border p-0.5">
          {(["mine", "group"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={view === option}
              onClick={() => switchView(option)}
              className={cn(
                "focus-visible:ring-ring min-h-11 rounded-[10px] px-4 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none",
                view === option ? "bg-primary text-primary-foreground" : "text-foreground"
              )}
            >
              {option === "mine" ? "Mine" : "Group"}
            </button>
          ))}
        </div>
        {paged ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              aria-label="Previous week"
              disabled={week === 0}
              onClick={() => setWeek(week - 1)}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <p className="min-w-24 text-center text-sm font-medium sm:min-w-40" aria-live="polite">
              {weekLabel(dates[visible[0]], dates[visible[visible.length - 1]], multiYear)}
            </p>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              aria-label="Next week"
              disabled={week === weeks.length - 1}
              onClick={() => setWeek(week + 1)}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      {view === "mine" ? (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Your availability</h3>
            <p className="text-muted-foreground text-xs">
              {editable ? "Click and drag to mark when you're free." : "Availability is closed."}
            </p>
          </div>
          {grid(
            (cell, slot) => {
              const selected = inDrag(cell) ? drag!.mode : mine.has(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  data-cell={cell.join(":")}
                  aria-pressed={selected}
                  aria-label={slotLabel(...(slot.split("T") as [string, string]))}
                  disabled={!editable}
                  onPointerDown={(event) => startDrag(cell, event)}
                  onClick={(event) => {
                    if (event.detail !== 0) return;
                    const next = new Set(mine);
                    if (selected) next.delete(slot);
                    else next.add(slot);
                    save(next);
                  }}
                  className={cn(
                    cellClass(cell[1]),
                    "touch-none",
                    selected
                      ? "bg-[color-mix(in_oklab,var(--avail)_35%,transparent)]"
                      : "bg-muted/40",
                    editable && "cursor-pointer"
                  )}
                />
              );
            },
            editable ? moveDrag : undefined
          )}
        </section>
      ) : (
        <section className="space-y-2">
          <div>
            <h3 className="text-sm font-medium">Group availability</h3>
            <p className="text-muted-foreground text-xs">
              {people.length === 0
                ? "No one has filled this in yet."
                : `Darker = more of the ${people.length} ${people.length === 1 ? "person" : "people"} who filled in are free. Tap a slot, or drag across slots to see who is free for the whole range.`}
            </p>
            <p
              className={cn(
                green,
                "text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs"
              )}
            >
              Fewer free
              {[20, 35, 50].map((level) => (
                <span
                  key={level}
                  aria-hidden="true"
                  className="h-2.5 w-3.5 rounded-sm border"
                  style={{
                    backgroundColor: `color-mix(in oklab, var(--avail) ${level}%, transparent)`,
                  }}
                />
              ))}
              Everyone free
            </p>
          </div>
          {grid((cell, slot) => {
            const free = freeAt.get(slot)?.size ?? 0;
            const label = `${slotLabel(...(slot.split("T") as [string, string]))}: ${free} of ${people.length} free`;
            return (
              <button
                key={slot}
                type="button"
                data-cell={cell.join(":")}
                aria-label={label}
                onPointerDown={(event) => startSelect(cell, event)}
                onPointerEnter={() => !pinned && selectSingle(cell, false)}
                onFocus={() => {
                  selectSingle(cell, false);
                  setAnnouncement(label);
                }}
                onClick={() => selectSingle(cell, true)}
                className={cn(
                  cellClass(cell[1]),
                  "touch-pan-y",
                  inSelection(cell) && "ring-foreground ring-2 ring-inset"
                )}
                style={
                  free > 0
                    ? {
                        backgroundColor: `color-mix(in oklab, var(--avail) ${Math.round(20 + (free / people.length) * 30)}%, transparent)`,
                      }
                    : undefined
                }
              />
            );
          }, moveSelect)}
        </section>
      )}

      {view === "group" ? (
        <aside
          aria-label="Who is free"
          className="bg-background fixed inset-x-0 bottom-0 z-20 max-h-[30vh] overflow-y-auto border-t px-4 py-3 text-sm shadow-[0_-4px_16px_rgb(0_0_0/0.12)] lg:sticky lg:inset-x-auto lg:top-4 lg:bottom-auto lg:z-auto lg:max-h-none lg:self-start lg:overflow-visible lg:border-t-0 lg:bg-transparent lg:p-0 lg:shadow-none"
        >
          {box ? (
            <>
              <p className="font-medium">
                {selectionLabel}
                <span className="text-muted-foreground block text-xs font-normal">
                  {count}
                  {isRange ? " for the whole range" : ""}
                </span>
              </p>
              <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-1">
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Free</p>
                  <p>{names(true)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium uppercase">Not free</p>
                  <p>{names(false)}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">Hover or tap a group slot to see who is free.</p>
          )}
        </aside>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
