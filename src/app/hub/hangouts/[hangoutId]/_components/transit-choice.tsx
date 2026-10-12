"use client";

import { useState } from "react";
import type { RideDirection } from "@prisma/client";
import { clearTransitAction, setTransitAction } from "@/app/actions/hangout-transit";
import { useRun } from "@/app/hub/hangouts/[hangoutId]/_components/use-run";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HangoutTransitItem } from "@/lib/hangouts";

const TRIPS: { direction: RideDirection; title: string; short: string }[] = [
  { direction: "PICKUP", title: "Getting there", short: "getting there" },
  { direction: "DROPOFF", title: "Getting home", short: "getting home" },
];

const describe = (row: HangoutTransitItem) =>
  row.destAddress ? `${row.startAddress} → ${row.destAddress}` : row.startAddress;

/**
 * Everyone's public transit choices (R5), and for a Going attendee who isn't driving, a form per
 * trip to set or clear their own (R4). Start and destination begin as the profile home.
 */
export function TransitChoice({
  hangoutId,
  transit,
  viewer,
  carsFor,
}: {
  hangoutId: string;
  transit: HangoutTransitItem[];
  viewer: { id: string; going: boolean; driving: boolean; homeAddress?: string | null };
  /** Driver names of the cars the viewer is on, per direction, so the form can warn about leaving one. */
  carsFor: Record<RideDirection, string | null>;
}) {
  const canChoose = viewer.going && !viewer.driving;
  if (transit.length === 0 && !canChoose) return null;

  return (
    <section aria-label="Public transit" className="space-y-3">
      <h3 className="font-medium">Public transit</h3>
      {transit.length > 0 ? (
        <ul aria-label="Taking public transit" className="space-y-1">
          {transit.map((row) => (
            <li key={`${row.userId}-${row.direction}`}>
              {row.name}
              <span className="text-muted-foreground">
                {" "}
                · {TRIPS.find((trip) => trip.direction === row.direction)?.short} · {describe(row)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Nobody is taking public transit.</p>
      )}
      {canChoose
        ? TRIPS.map((trip) => (
            <TransitForm
              key={trip.direction}
              hangoutId={hangoutId}
              trip={trip}
              mine={transit.find(
                (row) => row.userId === viewer.id && row.direction === trip.direction
              )}
              home={viewer.homeAddress ?? ""}
              leaving={carsFor[trip.direction]}
            />
          ))
        : null}
    </section>
  );
}

function TransitForm({
  hangoutId,
  trip,
  mine,
  home,
  leaving,
}: {
  hangoutId: string;
  trip: { direction: RideDirection; title: string; short: string };
  mine: HangoutTransitItem | undefined;
  home: string;
  leaving: string | null;
}) {
  const [isPending, run] = useRun();
  const [start, setStart] = useState(mine?.startAddress ?? home);
  const [destination, setDestination] = useState(mine?.destAddress ?? home);
  const needsDestination = trip.direction === "DROPOFF";
  const id = `transit-${trip.direction}`;

  return (
    <form
      aria-label={`${trip.title} by public transit`}
      className="space-y-2 rounded-2xl border px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () => setTransitAction(hangoutId, trip.direction, { start, destination }),
          mine ? "Transit updated" : "Marked as public transit"
        );
      }}
    >
      <p className="font-medium">
        {trip.title}
        {mine ? (
          <span className="text-muted-foreground"> · you&apos;re taking public transit</span>
        ) : null}
      </p>
      {leaving && !mine ? (
        <p className="text-muted-foreground text-xs">
          This takes you off {leaving}&apos;s car for {trip.short}.
        </p>
      ) : null}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-44 flex-1 flex-col gap-1">
          <Label htmlFor={`${id}-start`} className="text-xs">
            Starting from
          </Label>
          <Input
            id={`${id}-start`}
            maxLength={300}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        {needsDestination ? (
          <div className="flex min-w-44 flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-destination`} className="text-xs">
              Going to
            </Label>
            <Input
              id={`${id}-destination`}
              maxLength={300}
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
          </div>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={isPending || !start.trim() || (needsDestination && !destination.trim())}
        >
          {mine ? "Update" : "Take public transit"}
        </Button>
        {mine ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() =>
              run(() => clearTransitAction(hangoutId, trip.direction), "Transit choice removed")
            }
          >
            Not taking transit
          </Button>
        ) : null}
      </div>
    </form>
  );
}
