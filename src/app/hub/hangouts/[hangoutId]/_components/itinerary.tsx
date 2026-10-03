"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { StopType } from "@prisma/client";
import {
  addStopAction,
  deleteStopAction,
  moveStopAction,
  updateStopAction,
  type HangoutActionResult,
} from "@/app/actions/hangouts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { HangoutStopItem } from "@/lib/hangouts";
import { scheduleStops, timeText } from "@/lib/itinerary";
import type { StopWeather } from "@/lib/weather";
import { WeatherChip, WeatherCredit } from "@/app/hub/hangouts/[hangoutId]/_components/weather";

const STOP_TYPES: Array<[StopType, string]> = [
  ["COMMUTE", "Commute"],
  ["LOCATION", "Location"],
  ["RESTAURANT", "Restaurant"],
  ["POINT_OF_INTEREST", "Point of interest"],
  ["BREAK", "Break"],
];
const TYPE_LABEL = Object.fromEntries(STOP_TYPES) as Record<StopType, string>;

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours} h` : "", rest || !hours ? `${rest} min` : ""].filter(Boolean).join(" ");
}

function useRun() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<HangoutActionResult>, done?: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      if (done) toast.success(done);
      after?.();
      router.refresh();
    });
  }
  return [isPending, run] as const;
}

export function Itinerary({
  hangoutId,
  startSlot,
  stops,
  canEdit,
  weather = [],
}: {
  hangoutId: string;
  startSlot: string | null;
  stops: HangoutStopItem[];
  canEdit: boolean;
  weather?: StopWeather[];
}) {
  const [isPending, run] = useRun();
  const { times, end } = scheduleStops(startSlot, stops);
  const startDay = startSlot?.slice(0, 10) ?? null;

  return (
    <div className="space-y-4">
      {stops.length === 0 ? (
        <p className="text-muted-foreground text-sm">No stops yet.</p>
      ) : (
        <ol className="space-y-3">
          {stops.map((stop, index) => {
            const time = times[index];
            return (
              <li key={stop.id} className="space-y-1 rounded-2xl border px-4 py-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-medium">
                      <span className="text-muted-foreground tabular-nums">
                        {timeText(time, startDay)}
                      </span>{" "}
                      {stop.title}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      <Badge variant="outline" className="mr-2">
                        {TYPE_LABEL[stop.type]}
                      </Badge>
                      {duration(stop.durationMinutes)}
                      {stop.arriveBy ? " · arrive-by" : ""}
                    </p>
                  </div>
                  {canEdit ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${stop.title} up`}
                        disabled={isPending || index === 0}
                        onClick={() => run(() => moveStopAction(stop.id, -1))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Move ${stop.title} down`}
                        disabled={isPending || index === stops.length - 1}
                        onClick={() => run(() => moveStopAction(stop.id, 1))}
                      >
                        <ArrowDown />
                      </Button>
                      <StopDialog hangoutId={hangoutId} stop={stop} />
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${stop.title}`}
                        disabled={isPending}
                        onClick={() => {
                          if (window.confirm(`Delete "${stop.title}"?`))
                            run(() => deleteStopAction(stop.id), "Stop deleted");
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {"lateBy" in time && time.lateBy > 0 ? (
                  <p className="text-destructive text-xs">Running {duration(time.lateBy)} late</p>
                ) : null}
                {weather[index] ? <WeatherChip weather={weather[index]} /> : null}
                {stop.address ? (
                  <p>
                    {stop.address}
                    {stop.lat === null ? (
                      <span className="text-muted-foreground"> · not located on the map</span>
                    ) : null}
                  </p>
                ) : null}
                {stop.bring || stop.cashCents ? (
                  <p>
                    <span className="text-muted-foreground">Bring:</span>{" "}
                    {[
                      stop.bring,
                      stop.cashCents ? `$${(stop.cashCents / 100).toFixed(2)} cash each` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                ) : null}
                {stop.notes ? <p className="whitespace-pre-line">{stop.notes}</p> : null}
              </li>
            );
          })}
        </ol>
      )}
      {end ? (
        <p className="text-muted-foreground text-sm">
          Ends {timeText({ at: end, lateBy: 0 }, startDay)}
        </p>
      ) : null}
      {canEdit ? <StopDialog hangoutId={hangoutId} /> : null}
      {weather.length > 0 ? <WeatherCredit /> : null}
    </div>
  );
}

function StopDialog({ hangoutId, stop }: { hangoutId: string; stop?: HangoutStopItem }) {
  const initial = () => ({
    type: stop?.type ?? ("LOCATION" as StopType),
    title: stop?.title ?? "",
    address: stop?.address ?? "",
    duration: String(stop?.durationMinutes ?? 60),
    day: stop?.arriveBy?.split("T")[0] ?? "1",
    time: stop?.arriveBy?.split("T")[1] ?? "",
    notes: stop?.notes ?? "",
    bring: stop?.bring ?? "",
    cash: stop?.cashCents ? (stop.cashCents / 100).toFixed(2) : "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [isPending, run] = useRun();
  const set =
    (key: keyof ReturnType<typeof initial>) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = {
      type: form.type,
      title: form.title,
      address: form.address,
      durationMinutes: Number(form.duration),
      arriveBy: form.time && form.day ? `${form.day}T${form.time}` : null,
      notes: form.notes,
      bring: form.bring,
      cashCents: form.cash ? Math.round(Number(form.cash) * 100) : null,
    };
    run(
      () => (stop ? updateStopAction(stop.id, values) : addStopAction(hangoutId, values)),
      stop ? "Stop updated" : "Stop added",
      () => {
        setOpen(false);
        if (!stop) setForm(initial());
      }
    );
  }

  const id = (field: string) => `stop-${stop?.id ?? "new"}-${field}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {stop ? (
          <Button size="icon" variant="ghost" aria-label={`Edit ${stop.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button variant="outline" className="gap-2">
            <Plus className="size-4" />
            Add stop
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{stop ? "Edit stop" : "Add a stop"}</DialogTitle>
          <DialogDescription>
            A stop without an arrive-by starts when the previous one ends. Day 1 is the locked day.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={id("title")}>Name</Label>
              <Input id={id("title")} value={form.title} onChange={set("title")} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.type}
                onValueChange={(type) => setForm({ ...form, type: type as StopType })}
              >
                <SelectTrigger aria-label="Type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STOP_TYPES.map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("address")}>Address (optional)</Label>
            <Input id={id("address")} value={form.address} onChange={set("address")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor={id("duration")}>Duration (min)</Label>
              <Input
                id={id("duration")}
                type="number"
                min={0}
                max={1440}
                step={5}
                value={form.duration}
                onChange={set("duration")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id("day")}>Arrive-by day</Label>
              <Input
                id={id("day")}
                type="number"
                min={1}
                max={14}
                value={form.day}
                onChange={set("day")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id("time")}>Arrive-by time (EST)</Label>
              <Input id={id("time")} type="time" value={form.time} onChange={set("time")} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-2">
              <Label htmlFor={id("bring")}>Bring (optional)</Label>
              <Input id={id("bring")} value={form.bring} onChange={set("bring")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={id("cash")}>Cash each ($)</Label>
              <Input
                id={id("cash")}
                type="number"
                min={0}
                step={0.01}
                value={form.cash}
                onChange={set("cash")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor={id("notes")}>Notes (optional)</Label>
            <Textarea id={id("notes")} value={form.notes} onChange={set("notes")} rows={3} />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending || form.title.trim().length === 0}>
              {isPending ? "Saving..." : stop ? "Save stop" : "Add stop"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
