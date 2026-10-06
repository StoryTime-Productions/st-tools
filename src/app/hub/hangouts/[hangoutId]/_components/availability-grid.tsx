"use client";

import { useEffect, useState, useTransition, type PointerEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { saveAvailabilityAction } from "@/app/actions/hangouts";
import { slotTimes, type AvailabilityResponse, type AvailabilityWindow } from "@/lib/availability";
import { dayLabel, hourLabel, timeLabel } from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Cell = [day: number, row: number];

interface Drag {
  mode: boolean;
  from: Cell;
  to: Cell;
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
  const key = ([day, row]: Cell) => `${dates[day]}T${times[row]}`;

  const [mine, setMine] = useState(
    () => new Set(responses.find((response) => response.userId === user.id)?.slots)
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
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
          style={{ gridTemplateColumns: `auto repeat(${dates.length}, minmax(2.75rem, 1fr))` }}
          onPointerMove={onMove}
        >
          <span />
          {dates.map((day) => (
            <span key={day} className="pb-1 text-center text-xs leading-tight">
              <span className="text-muted-foreground block">
                {dayLabel(day, { weekday: "short" })}
              </span>
              {dayLabel(day, { month: "short", day: "numeric" })}
            </span>
          ))}
          {times.flatMap((time, row) => [
            <span
              key={time}
              className="text-muted-foreground -mt-1.5 pr-2 text-right text-[10px] leading-none"
            >
              {time.endsWith(":00") ? hourLabel(Number(time.slice(0, 2))) : ""}
            </span>,
            ...dates.map((day, index) => renderCell([index, row], `${day}T${time}`)),
          ])}
        </div>
      </div>
    );
  }

  const cellClass = (row: number) =>
    cn(
      "focus-visible:ring-ring h-4 border-l border-t focus-visible:ring-2 focus-visible:outline-none",
      row % 4 === 0 ? "border-t-border" : "border-t-border/30"
    );

  const focusFree = (focus && freeAt.get(focus)) || new Set<string>();
  const names = (free: boolean) =>
    people
      .filter((person) => focusFree.has(person.userId) === free)
      .map((person) => person.name)
      .join(", ") || "No one";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr_13rem]">
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
                  selected ? "bg-primary" : "bg-muted/40",
                  editable && "cursor-pointer"
                )}
              />
            );
          },
          editable ? moveDrag : undefined
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h3 className="text-sm font-medium">Group availability</h3>
          <p className="text-muted-foreground text-xs">
            {people.length === 0
              ? "No one has filled this in yet."
              : `Darker = more of the ${people.length} ${people.length === 1 ? "person" : "people"} who filled in are free.`}
          </p>
        </div>
        {grid((cell, slot) => {
          const free = freeAt.get(slot)?.size ?? 0;
          return (
            <button
              key={slot}
              type="button"
              aria-label={`${slotLabel(...(slot.split("T") as [string, string]))}: ${free} of ${people.length} free`}
              onPointerEnter={() => setFocus(slot)}
              onFocus={() => setFocus(slot)}
              onClick={() => setFocus(slot)}
              className={cn(
                cellClass(cell[1]),
                focus === slot && "ring-foreground ring-1 ring-inset"
              )}
              style={
                free > 0
                  ? {
                      backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round((free / people.length) * 100)}%, transparent)`,
                    }
                  : undefined
              }
            />
          );
        })}
      </section>

      <aside className="space-y-3 text-sm" aria-label="Who is free" aria-live="polite">
        {focus ? (
          <>
            <p className="font-medium">
              {slotLabel(...(focus.split("T") as [string, string]))}
              <span className="text-muted-foreground block text-xs font-normal">
                {focusFree.size} of {people.length} free
              </span>
            </p>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase">Free</p>
              <p>{names(true)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium uppercase">Not free</p>
              <p>{names(false)}</p>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Hover or tap a group slot to see who is free.</p>
        )}
      </aside>
    </div>
  );
}
