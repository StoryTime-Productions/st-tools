"use client";

import { useState } from "react";
import { Minus, Pencil, Plus, Trash2, TriangleAlert, X } from "lucide-react";
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
import {
  TransitChoice,
  type TransitStop,
} from "@/app/hub/hangouts/[hangoutId]/_components/transit-choice";
import { useRun } from "@/app/hub/hangouts/[hangoutId]/_components/use-run";
import { useConfirm } from "@/components/ui/confirm-dialog";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Toronto",
    hour: "numeric",
    minute: "2-digit",
  });

/** "+6 min for rain" when the forecast stretched this trip (T3). */
const delayNote = (trip: Trip) =>
  trip.delayMinutes ? ` (+${trip.delayMinutes} min for ${trip.reason})` : "";

const WHERE = (rider: CarPassenger) =>
  rider.pointKind === "COMMON"
    ? (rider.commonLabel ?? "common point")
    : rider.pointKind === "RIDER_HOME"
      ? "another rider's home"
      : (rider.homeAddress ?? "no home address");

interface StopGroup {
  key: string;
  where: string;
  time: string | null;
  riders: CarPassenger[];
}

/** Riders in route order; riders met at the same place and time share one stop. */
function groupStops(people: CarPassenger[], times: Record<string, string> | undefined) {
  const ordered = [...people].sort((a, b) =>
    times?.[a.userId] && times?.[b.userId] ? times[a.userId].localeCompare(times[b.userId]) : 0
  );
  const groups: StopGroup[] = [];
  for (const rider of ordered) {
    const where = WHERE(rider);
    const time = times?.[rider.userId] ?? null;
    const shared =
      rider.pointKind === "COMMON"
        ? groups.find((group) => group.where === where && group.time === time)
        : undefined;
    if (shared) shared.riders.push(rider);
    else groups.push({ key: rider.userId, where, time, riders: [rider] });
  }
  return groups;
}

/** One row of a car's vertical timeline; `filled` marks the hangout itself. */
function TimelineRow({
  filled,
  muted,
  children,
}: {
  filled?: boolean;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative min-w-0 pb-3 pl-7">
      <span
        aria-hidden="true"
        className={`absolute top-3.5 left-0 size-3.5 rounded-full border-2 ${
          filled ? "border-foreground bg-foreground" : "border-muted-foreground bg-background"
        }`}
      />
      <div
        className={`rounded-xl border px-3 py-2.5 ${
          filled
            ? "border-foreground/40 bg-muted"
            : muted
              ? "border-dashed bg-transparent"
              : "bg-muted/40"
        }`}
      >
        {children}
      </div>
    </li>
  );
}

export function RecomputeRoutes({ hangoutId }: { hangoutId: string }) {
  const [isPending, run] = useRun();
  return (
    <Button
      variant="outline"
      size="sm"
      className="max-sm:h-11"
      disabled={isPending}
      onClick={() => run(() => recomputeRoutesAction(hangoutId), "Routes recomputed")}
    >
      Recompute routes
    </Button>
  );
}

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
  stops = [],
}: {
  hangoutId: string;
  cars: HangoutCarItem[];
  attendees?: HangoutAttendeeItem[];
  transit?: HangoutTransitItem[];
  /** `homeAddress` is empty when the viewer has none, so offering a car asks for one (O2). */
  viewer: { id: string; isAdmin: boolean; going: boolean; homeAddress?: string | null };
  weather?: CarpoolWeather;
  /** The hangout's stops that have an address; getting home by transit can start at any of them. */
  stops?: TransitStop[];
}) {
  const [isPending, run] = useRun();
  const [confirm, confirmDialog] = useConfirm();
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
        <p
          role="status"
          className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-2xl border px-4 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Weather warning: {weather.warnings.join(", ")}. Drive times include extra time for the
            conditions.
          </span>
        </p>
      ) : null}
      {cars.length === 0 ? <p className="text-muted-foreground">No cars yet.</p> : null}
      {showNeeds && (waiting("pickup").length > 0 || waiting("dropoff").length > 0) ? (
        <div className="space-y-3 rounded-2xl border px-4 py-3">
          <p className="font-medium">Needs a ride</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["Getting there", waiting("pickup")],
                ["Getting home", waiting("dropoff")],
              ] as const
            ).map(([label, people]) =>
              people.length > 0 ? (
                <div key={label} className="space-y-2">
                  <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                    {label}
                  </p>
                  <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                    {people.map((person) => (
                      <li key={person.userId} className="bg-muted/40 rounded-full border px-3 py-1">
                        {person.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null
            )}
          </div>
        </div>
      ) : null}
      <ul className="space-y-3">
        {cars.map((car) => {
          const canManage = car.driver.userId === viewer.id || viewer.isAdmin;
          const seatsUsed = Math.max(car.pickups.length, car.dropoffs.length);
          const schedule =
            car.schedule && !("error" in car.schedule) && !car.schedule.manual
              ? car.schedule
              : null;
          const there = schedule?.there;
          const back = schedule?.back;
          const lists: { direction: RideDirection; title: string; people: typeof car.pickups }[] = [
            { direction: "PICKUP", title: "Pick up", people: car.pickups },
            { direction: "DROPOFF", title: "Drop off", people: car.dropoffs },
          ];
          const stopList = ({ direction, title, people }: (typeof lists)[number]) => {
            const times = (direction === "PICKUP" ? there : back)?.stops;
            return (
              <>
                <li
                  aria-hidden="true"
                  className="text-muted-foreground list-none pt-4 pb-2 pl-7 text-xs font-medium tracking-wide uppercase"
                >
                  {direction === "PICKUP" ? "Getting there" : "Getting home"}
                </li>
                {people.length > 0 ? (
                  <li className="list-none">
                    <ul aria-label={title} className="m-0 list-none p-0">
                      {groupStops(people, times).map((stop) => (
                        <TimelineRow key={stop.key}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            {stop.riders.map((rider) => (
                              <span key={rider.userId} className="inline-flex items-center gap-1">
                                <span className="font-medium">{rider.name}</span>
                                {canManage ? (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-6 max-sm:size-11"
                                    aria-label={`Remove ${rider.name} from ${title.toLowerCase()}`}
                                    disabled={isPending}
                                    onClick={() =>
                                      run(
                                        () =>
                                          unassignPassengerAction(car.id, rider.userId, direction),
                                        "Removed"
                                      )
                                    }
                                  >
                                    <X />
                                  </Button>
                                ) : null}
                              </span>
                            ))}
                          </div>
                          <p className="text-muted-foreground break-words">
                            {stop.where}
                            {stop.time ? ` · ${clock(stop.time)}` : null}
                          </p>
                        </TimelineRow>
                      ))}
                    </ul>
                  </li>
                ) : (
                  <TimelineRow muted>
                    <p className="text-muted-foreground">No one assigned</p>
                  </TimelineRow>
                )}
                {canManage ? (
                  <li className="list-none pt-1 pb-4 pl-7 empty:hidden">
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
                  </li>
                ) : null}
              </>
            );
          };
          return (
            <li
              key={car.id}
              aria-label={`${car.driver.name}'s car`}
              className="space-y-3 rounded-2xl border px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-2">
                  <p className="font-medium">{car.driver.name}&apos;s car</p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">
                      {seatsUsed}/{car.seats} seats
                    </Badge>
                    {there ? (
                      <Badge variant="outline">
                        Leaves {clock(there.start)}
                        {delayNote(there)}
                      </Badge>
                    ) : null}
                    {there ? <Badge variant="outline">Arrives {clock(there.end)}</Badge> : null}
                    {back ? (
                      <Badge variant="outline">
                        Back {clock(back.start)} – {clock(back.end)}
                        {delayNote(back)}
                      </Badge>
                    ) : null}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    <CarDialog car={car} />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="max-sm:size-11"
                      aria-label={`Remove ${car.driver.name}'s car`}
                      disabled={isPending}
                      onClick={async () => {
                        const ok = await confirm("Its riders will need another car.", {
                          title: `Remove ${car.driver.name}'s car?`,
                          confirmLabel: "Remove",
                        });
                        if (ok) run(() => removeCarAction(car.id), "Car removed");
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </div>
              <ol className="before:bg-border relative m-0 -mb-3 list-none p-0 before:absolute before:top-4 before:bottom-4 before:left-[6px] before:w-px">
                <TimelineRow>
                  <p>
                    <span className="text-muted-foreground">Start: </span>
                    {car.startAddress ??
                      (car.driver.homeAddress
                        ? `${car.driver.homeAddress} (home)`
                        : "no address yet")}
                  </p>
                  {!schedule && (car.pickups.length > 0 || car.dropoffs.length > 0) ? (
                    <p className="text-muted-foreground">
                      Route not computed
                      {car.schedule && "error" in car.schedule
                        ? `: ${car.schedule.error}`
                        : ""}.{" "}
                      {viewer.isAdmin ? "Try Recompute routes." : "Ask an admin to recompute."}
                    </p>
                  ) : null}
                </TimelineRow>
                {stopList(lists[0])}
                <TimelineRow filled>
                  <p className="font-medium">
                    Hangout
                    {there ? (
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · arrive {clock(there.end)}
                      </span>
                    ) : null}
                  </p>
                </TimelineRow>
                {stopList(lists[1])}
              </ol>
            </li>
          );
        })}
      </ul>
      <TransitChoice
        hangoutId={hangoutId}
        transit={transit}
        viewer={{ ...viewer, driving }}
        stops={stops}
        carsFor={{
          PICKUP:
            cars.find((car) => car.pickups.some((p) => p.userId === viewer.id))?.driver.name ??
            null,
          DROPOFF:
            cars.find((car) => car.dropoffs.some((p) => p.userId === viewer.id))?.driver.name ??
            null,
        }}
      />
      {!viewer.going ? (
        <p className="text-muted-foreground">Mark yourself Going to drive or ride.</p>
      ) : !driving ? (
        <div className="space-y-4 rounded-2xl border px-4 py-3">
          <div>
            <p className="font-medium">Offer your car</p>
            <p className="text-muted-foreground text-xs">Riders you can take, not counting you.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-seats">Seats for riders</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="max-sm:size-11"
                aria-label="Fewer seats"
                disabled={Number(seats) <= 1}
                onClick={() => setSeats(String(Math.max(1, (Number(seats) || 1) - 1)))}
              >
                <Minus />
              </Button>
              <Input
                id="offer-seats"
                type="number"
                inputMode="numeric"
                min={1}
                max={12}
                className="w-20 [appearance:textfield] text-center max-sm:h-11 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={seats}
                onChange={(event) => setSeats(event.target.value)}
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="max-sm:size-11"
                aria-label="More seats"
                disabled={Number(seats) >= 12}
                onClick={() => setSeats(String(Math.min(12, (Number(seats) || 0) + 1)))}
              >
                <Plus />
              </Button>
            </div>
          </div>
          {needsAddress ? (
            <div className="space-y-2">
              <Label htmlFor="offer-address">Your start address</Label>
              <Input
                id="offer-address"
                autoComplete="street-address"
                maxLength={300}
                className="max-sm:h-11"
                placeholder="Saved to your profile"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
          ) : null}
          <Button
            className="w-full max-sm:h-11 sm:w-auto"
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
      {confirmDialog}
    </div>
  );
}

const selectClass =
  "border-input bg-background min-h-9 min-w-0 flex-1 rounded-md border px-3 text-sm max-sm:min-h-11";

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
  const [open, setOpen] = useState(false);
  const id = `${carId}-${direction}`;
  const lower = title.toLowerCase();
  const noun = direction === "PICKUP" ? "pick-up" : "drop-off";

  if (candidates.length === 0) return null;
  if (seatsFull)
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="max-sm:h-11" disabled>
          <Plus /> Add {noun}
        </Button>
        <p className="text-muted-foreground text-xs">Full: no seat left to add to {lower}.</p>
      </div>
    );
  if (!open)
    return (
      <Button
        size="sm"
        variant="outline"
        className="max-sm:h-11"
        aria-expanded="false"
        onClick={() => setOpen(true)}
      >
        <Plus /> Add {noun}
      </Button>
    );

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
            setOpen(false);
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
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="max-sm:h-11" disabled={isPending || !point}>
          Add
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="max-sm:h-11"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
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
        <Button
          size="icon"
          variant="ghost"
          className="max-sm:size-11"
          aria-label={`Edit ${car.driver.name}'s car`}
        >
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
