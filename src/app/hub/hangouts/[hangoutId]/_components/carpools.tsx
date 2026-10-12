"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import type { RideDirection } from "@prisma/client";
import {
  offerCarAction,
  recomputeRoutesAction,
  assignPassengerAction,
  removeCarAction,
  unassignPassengerAction,
  updateCarAction,
  type PassengerPoint,
} from "@/app/actions/carpools";
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
import type {
  CarPassenger,
  HangoutAttendeeItem,
  HangoutCarItem,
  HangoutTransitItem,
} from "@/lib/hangouts";
import type { Trip } from "@/lib/routes";
import { TransitChoice } from "@/app/hub/hangouts/[hangoutId]/_components/transit-choice";
import { useRun } from "@/app/hub/hangouts/[hangoutId]/_components/use-run";
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

export function Carpools({
  hangoutId,
  cars,
  attendees = [],
  transit = [],
  viewer,
  weather = { warnings: [], checked: false },
}: {
  hangoutId: string;
  cars: HangoutCarItem[];
  attendees?: HangoutAttendeeItem[];
  transit?: HangoutTransitItem[];
  /** `homeAddress` is empty when the viewer has none, so offering a car asks for one (O2). */
  viewer: { id: string; isAdmin: boolean; going: boolean; homeAddress?: string | null };
  weather?: CarpoolWeather;
}) {
  const [isPending, run] = useRun();
  const [seats, setSeats] = useState("4");
  const [address, setAddress] = useState("");
  const needsAddress = viewer.homeAddress !== undefined && !viewer.homeAddress;
  const driving = cars.some((car) => car.driver.userId === viewer.id);
  // Only drivers and admins see who still needs a ride (R6).
  const waiting = (key: "pickup" | "dropoff") =>
    attendees.filter((attendee) => attendee.needsRide[key]);
  const showNeeds = (driving || viewer.isAdmin) && cars.length > 0;

  return (
    <div className="space-y-4 text-sm">
      {weather.warnings.length > 0 ? (
        <p role="status" className="text-destructive rounded-2xl border px-4 py-3">
          Weather warning: {weather.warnings.join(", ")}. Drive times include extra time for the
          conditions.
        </p>
      ) : null}
      {cars.length === 0 ? <p className="text-muted-foreground">No cars yet.</p> : null}
      {showNeeds
        ? (
            [
              ["Getting there", waiting("pickup")],
              ["Getting home", waiting("dropoff")],
            ] as const
          ).map(([label, people]) =>
            people.length > 0 ? (
              <p key={label} className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Needs a ride, {label.toLowerCase()}:</span>
                {people.map((person) => (
                  <Badge key={person.userId} variant="outline">
                    {person.name}
                  </Badge>
                ))}
              </p>
            ) : null
          )
        : null}
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
                  {schedule && !schedule.there && !schedule.back ? null : schedule ? (
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
              {lists.map(({ direction, title, people }) => (
                <div key={direction} className="space-y-1">
                  {people.length > 0 ? (
                    <ul aria-label={title} className="space-y-1">
                      {people.map((rider) => {
                        const at =
                          schedule?.[direction === "PICKUP" ? "there" : "back"]?.stops[
                            rider.userId
                          ];
                        return (
                          <li
                            key={rider.userId}
                            className="flex items-center justify-between gap-2"
                          >
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
                  ) : null}
                  {canManage ? (
                    <AddPassenger
                      carId={car.id}
                      direction={direction}
                      title={title}
                      people={people}
                      candidates={attendees.filter(
                        (attendee) =>
                          attendee.needsRide[direction === "PICKUP" ? "pickup" : "dropoff"]
                      )}
                      seatsFull={people.length >= car.seats}
                    />
                  ) : null}
                </div>
              ))}
            </li>
          );
        })}
      </ul>
      <TransitChoice
        hangoutId={hangoutId}
        transit={transit}
        viewer={{ ...viewer, driving }}
        carsFor={{
          PICKUP:
            cars.find((car) => car.pickups.some((p) => p.userId === viewer.id))?.driver.name ??
            null,
          DROPOFF:
            cars.find((car) => car.dropoffs.some((p) => p.userId === viewer.id))?.driver.name ??
            null,
        }}
      />
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

const selectClass = "border-input bg-background h-9 min-w-0 flex-1 rounded-md border px-3 text-sm";

type PointKind = "HOME" | "RIDER_HOME" | "COMMON";

/** Add one Going attendee to a car's list, choosing where they are met (R3). */
function AddPassenger({
  carId,
  direction,
  title,
  people,
  candidates,
  seatsFull,
}: {
  carId: string;
  direction: RideDirection;
  title: string;
  people: CarPassenger[];
  candidates: HangoutAttendeeItem[];
  seatsFull: boolean;
}) {
  const [isPending, run] = useRun();
  const [pickedPerson, setPickedPerson] = useState("");
  const [kind, setKind] = useState<PointKind>("HOME");
  const [pickedVia, setPickedVia] = useState("");
  const [address, setAddress] = useState("");
  const id = `${carId}-${direction}`;
  const lower = title.toLowerCase();

  if (candidates.length === 0) return null;
  if (seatsFull)
    return <p className="text-muted-foreground text-xs">Full: no seat left to add to {lower}.</p>;

  const person = candidates.some((c) => c.userId === pickedPerson)
    ? pickedPerson
    : candidates[0].userId;
  const hosts = people.filter((p) => p.userId !== person && p.homeLat !== null);
  const via = hosts.some((h) => h.userId === pickedVia) ? pickedVia : (hosts[0]?.userId ?? "");
  const point: PassengerPoint | null =
    kind === "HOME"
      ? { kind }
      : kind === "RIDER_HOME"
        ? via
          ? { kind, viaUserId: via }
          : null
        : address.trim()
          ? { kind, address }
          : null;

  return (
    <form
      aria-label={`Add to ${lower}`}
      className="flex flex-wrap items-end gap-2 pt-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (!point) return;
        run(
          () => assignPassengerAction(carId, person, direction, point),
          `Added to ${lower}`,
          () => {
            setPickedPerson("");
            setAddress("");
          }
        );
      }}
    >
      <div className="flex min-w-36 flex-1 flex-col gap-1">
        <Label htmlFor={`${id}-person`} className="text-xs">
          {title}
        </Label>
        <select
          id={`${id}-person`}
          className={selectClass}
          value={person}
          onChange={(event) => setPickedPerson(event.target.value)}
        >
          {candidates.map((candidate) => (
            <option key={candidate.userId} value={candidate.userId}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-36 flex-1 flex-col gap-1">
        <Label htmlFor={`${id}-point`} className="text-xs">
          Meet at
        </Label>
        <select
          id={`${id}-point`}
          className={selectClass}
          value={kind}
          onChange={(event) => setKind(event.target.value as PointKind)}
        >
          <option value="HOME">Their home</option>
          {hosts.length > 0 ? <option value="RIDER_HOME">Another rider&apos;s home</option> : null}
          <option value="COMMON">A common point</option>
        </select>
      </div>
      {kind === "RIDER_HOME" ? (
        <div className="flex min-w-36 flex-1 flex-col gap-1">
          <Label htmlFor={`${id}-via`} className="text-xs">
            Whose home
          </Label>
          <select
            id={`${id}-via`}
            className={selectClass}
            value={via}
            onChange={(event) => setPickedVia(event.target.value)}
          >
            {hosts.map((host) => (
              <option key={host.userId} value={host.userId}>
                {host.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {kind === "COMMON" ? (
        <div className="flex min-w-44 flex-1 flex-col gap-1">
          <Label htmlFor={`${id}-address`} className="text-xs">
            Meeting address
          </Label>
          <Input
            id={`${id}-address`}
            maxLength={300}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        </div>
      ) : null}
      <Button type="submit" size="sm" disabled={isPending || !point}>
        Add
      </Button>
    </form>
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
