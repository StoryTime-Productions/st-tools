"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  joinCarAction,
  leaveCarAction,
  offerCarAction,
  recomputeRoutesAction,
  removeCarAction,
  removeRiderAction,
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
import type { HangoutCarItem } from "@/lib/hangouts";
import type { Trip } from "@/lib/routes";
import { WeatherCredit } from "@/app/hub/hangouts/[hangoutId]/_components/weather";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  });

/** "+6 min for rain" when the forecast stretched this trip (T3). */
const delayNote = (trip: Trip) =>
  trip.delayMinutes ? ` (+${trip.delayMinutes} min for ${trip.reason})` : "";

export interface CarpoolWeather {
  /** Distinct warnings across the stops. */
  warnings: string[];
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
  weather = { warnings: [], checked: false },
}: {
  hangoutId: string;
  cars: HangoutCarItem[];
  viewer: { id: string; isAdmin: boolean; going: boolean };
  weather?: CarpoolWeather;
}) {
  const [isPending, run] = useRun();
  const [seats, setSeats] = useState("4");
  const driving = cars.some((car) => car.driver.userId === viewer.id);
  const riding = cars.find((car) => car.riders.some((rider) => rider.userId === viewer.id));

  return (
    <div className="space-y-4 text-sm">
      {weather.warnings.length > 0 ? (
        <p role="status" className="text-destructive rounded-2xl border px-4 py-3">
          Weather warning: {weather.warnings.join(", ")}. Drive times include extra time for the
          conditions.
        </p>
      ) : null}
      {cars.length === 0 ? <p className="text-muted-foreground">No cars yet.</p> : null}
      <ul className="space-y-3">
        {cars.map((car) => {
          const canManage = car.driver.userId === viewer.id || viewer.isAdmin;
          const mine = car.riders.find((rider) => rider.userId === viewer.id);
          const full = car.riders.length >= car.seats;
          const schedule =
            car.schedule && "there" in car.schedule && !car.schedule.manual ? car.schedule : null;
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
                  {schedule ? (
                    <p>
                      <span className="text-muted-foreground">Drive:</span> leaves{" "}
                      {clock(schedule.there.start)}
                      {delayNote(schedule.there)}, arrives {clock(schedule.there.end)} · back{" "}
                      {clock(schedule.back.start)} – {clock(schedule.back.end)}
                      {delayNote(schedule.back)}
                    </p>
                  ) : car.schedule ? (
                    <p className="text-muted-foreground">
                      Routes could not be computed:{" "}
                      {"error" in car.schedule
                        ? car.schedule.error
                        : "these times were typed in before they were computed"}
                      . {viewer.isAdmin ? "Try Recompute routes." : "Ask an admin to recompute."}
                    </p>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex gap-1">
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
                        {schedule ? (
                          <span className="text-muted-foreground">
                            {" "}
                            · pick-up {clock(schedule.there.stops[rider.userId])} · drop-off{" "}
                            {clock(schedule.back.stops[rider.userId])}
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
