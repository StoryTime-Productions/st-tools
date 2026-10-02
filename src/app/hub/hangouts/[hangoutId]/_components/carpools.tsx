"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  joinCarAction,
  leaveCarAction,
  offerCarAction,
  recomputeRoutesAction,
  removeCarAction,
  removeRiderAction,
  setCarTimesAction,
  updateCarAction,
  type CarpoolActionResult,
} from "@/app/actions/carpools";
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
import { torontoInputValue } from "@/lib/calendar";
import { setWeatherBufferAction } from "@/app/actions/hangouts";
import type { HangoutCarItem } from "@/lib/hangouts";
import { WeatherCredit } from "@/app/hub/hangouts/[hangoutId]/_components/weather";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  });

const shift = (iso: string, minutes: number) =>
  minutes === 0 ? iso : new Date(new Date(iso).getTime() - minutes * 60_000).toISOString();

export interface CarpoolWeather {
  /** Distinct warnings across the stops; empty = no buffer applies. */
  warnings: string[];
  bufferMinutes: number;
  /** Whether forecasts were looked up at all (Scheduled with stops). */
  checked: boolean;
}

function useRun() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<CarpoolActionResult>, done: string, after?: () => void) {
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      after?.();
      router.refresh();
    });
  }
  return [isPending, run] as const;
}

export function Carpools({
  hangoutId,
  cars,
  viewer,
  weather = { warnings: [], bufferMinutes: 0, checked: false },
}: {
  hangoutId: string;
  cars: HangoutCarItem[];
  viewer: { id: string; isAdmin: boolean; going: boolean };
  weather?: CarpoolWeather;
}) {
  const [isPending, run] = useRun();
  const [buffer, setBuffer] = useState(String(weather.bufferMinutes));
  const buffered = weather.warnings.length > 0 ? weather.bufferMinutes : 0;
  const [seats, setSeats] = useState("4");
  const driving = cars.some((car) => car.driver.userId === viewer.id);
  const riding = cars.find((car) => car.riders.some((rider) => rider.userId === viewer.id));

  return (
    <div className="space-y-4 text-sm">
      {weather.warnings.length > 0 ? (
        <p role="status" className="text-destructive rounded-2xl border px-4 py-3">
          Weather warning: {weather.warnings.join(", ")}.{" "}
          {buffered > 0
            ? `Routed leave and pick-up times include a ${buffered} min buffer.`
            : "No buffer is set."}{" "}
          Times you typed in are unchanged; consider leaving earlier.
        </p>
      ) : null}
      {cars.length === 0 ? <p className="text-muted-foreground">No cars yet.</p> : null}
      <ul className="space-y-3">
        {cars.map((car) => {
          const canManage = car.driver.userId === viewer.id || viewer.isAdmin;
          const mine = car.riders.find((rider) => rider.userId === viewer.id);
          const full = car.riders.length >= car.seats;
          const typedIn = Boolean(car.schedule && "there" in car.schedule && car.schedule.manual);
          const shiftThere = (iso: string) => (typedIn ? iso : shift(iso, buffered));
          const join = (atCommonPoint: boolean, label: string) => (
            <Button
              size="sm"
              variant={mine && mine.atCommonPoint === atCommonPoint ? "default" : "outline"}
              aria-pressed={mine ? mine.atCommonPoint === atCommonPoint : undefined}
              disabled={isPending}
              onClick={() =>
                run(() => joinCarAction(car.id, atCommonPoint), mine ? "Pick-up updated" : "Joined")
              }
            >
              {label}
            </Button>
          );
          return (
            <li
              key={car.id}
              aria-label={`${car.driver.name}'s car`}
              className="space-y-2 rounded-2xl border px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="font-medium">
                    {car.driver.name}&apos;s car
                    <span className="text-muted-foreground">
                      {" "}
                      · {car.riders.length}/{car.seats} seats
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Starts from:</span>{" "}
                    {car.startAddress ??
                      (car.driver.homeAddress
                        ? `${car.driver.homeAddress} (home)`
                        : "no address yet")}
                  </p>
                  {car.commonPoint ? (
                    <p>
                      <span className="text-muted-foreground">Common point:</span> {car.commonPoint}
                    </p>
                  ) : null}
                  {car.schedule && "there" in car.schedule ? (
                    <p>
                      <span className="text-muted-foreground">
                        Drive{car.schedule.manual ? " (typed in)" : ""}:
                      </span>{" "}
                      leaves {clock(shiftThere(car.schedule.there.start))}
                      {shiftThere(car.schedule.there.start) !== car.schedule.there.start
                        ? ` (${clock(car.schedule.there.start)} without weather buffer)`
                        : ""}
                      , arrives {clock(car.schedule.there.end)} · back{" "}
                      {clock(car.schedule.back.start)} – {clock(car.schedule.back.end)}
                    </p>
                  ) : car.schedule ? (
                    <p className="text-muted-foreground">No drive times: {car.schedule.error}</p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    {car.schedule && "there" in car.schedule && !car.schedule.manual ? null : (
                      <TimesDialog car={car} />
                    )}
                    <CarDialog car={car} />
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${car.driver.name}'s car`}
                      disabled={isPending}
                      onClick={() => {
                        if (window.confirm("Remove this car? Its riders will need another car."))
                          run(() => removeCarAction(car.id), "Car removed");
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </div>
              {car.riders.length > 0 ? (
                <ul aria-label="Riders" className="space-y-1">
                  {car.riders.map((rider) => (
                    <li key={rider.userId} className="flex items-center justify-between gap-2">
                      <span>
                        {rider.name}
                        <span className="text-muted-foreground"> · </span>
                        {rider.atCommonPoint ? (
                          "common point"
                        ) : rider.homeAddress ? (
                          rider.homeAddress
                        ) : (
                          <span className="text-muted-foreground">
                            no home address
                            {rider.userId === viewer.id ? (
                              <>
                                {" "}
                                ·{" "}
                                <Link href="/settings/profile" className="underline">
                                  add one in your profile
                                </Link>
                              </>
                            ) : null}
                          </span>
                        )}
                        {car.schedule && "there" in car.schedule ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · pick-up {clock(shiftThere(car.schedule.there.stops[rider.userId]))} ·
                            drop-off {clock(car.schedule.back.stops[rider.userId])}
                          </span>
                        ) : null}
                      </span>
                      {canManage ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${rider.name}`}
                          disabled={isPending}
                          onClick={() =>
                            run(() => removeRiderAction(car.id, rider.userId), "Rider removed")
                          }
                        >
                          <X />
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
              {viewer.going && !driving && (mine || !full) ? (
                <div className="flex flex-wrap gap-2">
                  {join(false, mine ? "Pick me up at home" : "Join")}
                  {car.commonPoint
                    ? join(true, mine ? "Pick me up at the common point" : "Join at common point")
                    : null}
                  {mine ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => leaveCarAction(hangoutId), "Left the car")}
                    >
                      Leave car
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {full && !mine ? <p className="text-muted-foreground text-xs">Full</p> : null}
            </li>
          );
        })}
      </ul>
      {viewer.isAdmin && cars.length > 0 ? (
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          onClick={() => run(() => recomputeRoutesAction(hangoutId), "Routes recomputed")}
        >
          Recompute routes
        </Button>
      ) : null}
      {viewer.isAdmin && weather.checked ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => setWeatherBufferAction(hangoutId, Number(buffer)), "Buffer saved");
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="weather-buffer">Weather buffer (minutes)</Label>
            <Input
              id="weather-buffer"
              type="number"
              min={0}
              max={120}
              className="w-24"
              value={buffer}
              onChange={(event) => setBuffer(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            Save buffer
          </Button>
        </form>
      ) : null}
      {weather.checked ? <WeatherCredit /> : null}
      {!viewer.going ? (
        <p className="text-muted-foreground">Mark yourself Going to drive or ride.</p>
      ) : !driving && !riding ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="offer-seats">Seats for riders</Label>
            <Input
              id="offer-seats"
              type="number"
              min={1}
              max={12}
              className="w-24"
              value={seats}
              onChange={(event) => setSeats(event.target.value)}
            />
          </div>
          <Button
            disabled={isPending}
            onClick={() => run(() => offerCarAction(hangoutId, Number(seats)), "Car added")}
          >
            Offer my car
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CarDialog({ car }: { car: HangoutCarItem }) {
  const initial = () => ({
    seats: String(car.seats),
    startAddress: car.startAddress ?? "",
    commonPoint: car.commonPoint ?? "",
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [isPending, run] = useRun();
  const set =
    (key: keyof ReturnType<typeof initial>) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: event.target.value });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run(
      () =>
        updateCarAction(car.id, {
          seats: Number(form.seats),
          startAddress: form.startAddress,
          commonPoint: form.commonPoint,
        }),
      "Car updated",
      () => setOpen(false)
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Edit ${car.driver.name}'s car`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit car</DialogTitle>
          <DialogDescription>
            An empty start address means the driver&apos;s home. Clearing the common point moves its
            riders to home pick-up.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`car-${car.id}-seats`}>Seats for riders</Label>
            <Input
              id={`car-${car.id}-seats`}
              type="number"
              min={1}
              max={12}
              value={form.seats}
              onChange={set("seats")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`car-${car.id}-start`}>Start address (optional)</Label>
            <Input
              id={`car-${car.id}-start`}
              value={form.startAddress}
              onChange={set("startAddress")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`car-${car.id}-common`}>Common point (optional)</Label>
            <Input
              id={`car-${car.id}-common`}
              value={form.commonPoint}
              onChange={set("commonPoint")}
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save car"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const local = (iso?: string) => (iso ? torontoInputValue(new Date(iso)) : "");

/** Fallback for cars routing couldn't handle: type the leave, pick-up and drop-off times. */
function TimesDialog({ car }: { car: HangoutCarItem }) {
  const initial = () => {
    const kept = car.schedule && "there" in car.schedule ? car.schedule : null;
    const trip = (t?: { start: string; end: string; stops: Record<string, string> }) => ({
      start: local(t?.start),
      end: local(t?.end),
      stops: Object.fromEntries(car.riders.map((r) => [r.userId, local(t?.stops[r.userId])])),
    });
    return { there: trip(kept?.there), back: trip(kept?.back) };
  };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initial);
  const [isPending, run] = useRun();
  type Leg = "there" | "back";
  const field = (leg: Leg, label: string, value: string, change: (v: string) => void) => (
    <div className="space-y-1">
      <Label htmlFor={`car-${car.id}-${leg}-${label}`}>{label}</Label>
      <Input
        id={`car-${car.id}-${leg}-${label}`}
        type="datetime-local"
        required
        value={value}
        onChange={(event) => change(event.target.value)}
      />
    </div>
  );
  const edit = (leg: Leg, patch: Partial<(typeof form)["there"]>) =>
    setForm({ ...form, [leg]: { ...form[leg], ...patch } });
  const section = (leg: Leg, title: string, start: string, end: string) => (
    <fieldset className="space-y-2">
      <legend className="font-medium">{title}</legend>
      {field(leg, start, form[leg].start, (v) => edit(leg, { start: v }))}
      {car.riders.map((rider) =>
        field(
          leg,
          `${rider.name} ${leg === "there" ? "pick-up" : "drop-off"}`,
          form[leg].stops[rider.userId],
          (v) => edit(leg, { stops: { ...form[leg].stops, [rider.userId]: v } })
        )
      )}
      {field(leg, end, form[leg].end, (v) => edit(leg, { end: v }))}
    </fieldset>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial());
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label={`Set ${car.driver.name}'s drive times`}>
          <Clock />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Drive times</DialogTitle>
          <DialogDescription>
            Type the times yourself. The next successful route recompute replaces them.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => setCarTimesAction(car.id, form),
              "Drive times saved",
              () => setOpen(false)
            );
          }}
          className="space-y-4"
        >
          {section("there", "Way there", "Leaves", "Arrives")}
          {section("back", "Way back", "Leaves the last stop", "Home")}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save times"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
