"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import type { RideDirection } from "@prisma/client";
import { toast } from "sonner";
import {
  offerCarAction,
  recomputeRoutesAction,
  removeCarAction,
  unassignPassengerAction,
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
  /** `homeAddress` is empty when the viewer has none, so offering a car asks for one (O2). */
  viewer: { id: string; isAdmin: boolean; going: boolean; homeAddress?: string | null };
  weather?: CarpoolWeather;
}) {
  const [isPending, run] = useRun();
  const [seats, setSeats] = useState("4");
  const [address, setAddress] = useState("");
  const needsAddress = viewer.homeAddress !== undefined && !viewer.homeAddress;
  const driving = cars.some((car) => car.driver.userId === viewer.id);

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
          const seatsUsed = Math.max(car.pickups.length, car.dropoffs.length);
          const schedule =
            car.schedule && !("error" in car.schedule) && !car.schedule.manual
              ? car.schedule
              : null;
          const lists: { direction: RideDirection; title: string; people: typeof car.pickups }[] = [
            { direction: "PICKUP", title: "Pick up", people: car.pickups },
            { direction: "DROPOFF", title: "Drop off", people: car.dropoffs },
          ];
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
                      · {seatsUsed}/{car.seats} seats
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Starts from:</span>{" "}
                    {car.startAddress ??
                      (car.driver.homeAddress
                        ? `${car.driver.homeAddress} (home)`
                        : "no address yet")}
                  </p>
                  {schedule ? (
                    <p>
                      <span className="text-muted-foreground">Drive:</span>
                      {schedule.there ? (
                        <>
                          {" "}
                          leaves {clock(schedule.there.start)}
                          {delayNote(schedule.there)}, arrives {clock(schedule.there.end)}
                        </>
                      ) : null}
                      {schedule.there && schedule.back ? " ·" : null}
                      {schedule.back ? (
                        <>
                          {" "}
                          back {clock(schedule.back.start)} – {clock(schedule.back.end)}
                          {delayNote(schedule.back)}
                        </>
                      ) : null}
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
              {lists.map(({ direction, title, people }) =>
                people.length > 0 ? (
                  <ul key={direction} aria-label={title} className="space-y-1">
                    {people.map((rider) => {
                      const at =
                        schedule?.[direction === "PICKUP" ? "there" : "back"]?.stops[rider.userId];
                      return (
                        <li key={rider.userId} className="flex items-center justify-between gap-2">
                          <span>
                            <span className="text-muted-foreground">{title}: </span>
                            {rider.name}
                            <span className="text-muted-foreground"> · </span>
                            {rider.pointKind === "COMMON"
                              ? (rider.commonLabel ?? "common point")
                              : rider.pointKind === "RIDER_HOME"
                                ? "another rider's home"
                                : (rider.homeAddress ?? "no home address")}
                            {at ? (
                              <span className="text-muted-foreground"> · {clock(at)}</span>
                            ) : null}
                          </span>
                          {canManage ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Remove ${rider.name} from ${title.toLowerCase()}`}
                              disabled={isPending}
                              onClick={() =>
                                run(
                                  () => unassignPassengerAction(car.id, rider.userId, direction),
                                  "Removed"
                                )
                              }
                            >
                              <X />
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null
              )}
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
      ) : !driving ? (
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
          {needsAddress ? (
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="offer-address">Your start address</Label>
              <Input
                id="offer-address"
                autoComplete="street-address"
                maxLength={300}
                placeholder="Saved to your profile"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
          ) : null}
          <Button
            disabled={isPending || (needsAddress && address.trim().length === 0)}
            onClick={() =>
              run(
                () => offerCarAction(hangoutId, Number(seats), needsAddress ? address : undefined),
                "Car added"
              )
            }
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
            An empty start address means the driver&apos;s home.
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
