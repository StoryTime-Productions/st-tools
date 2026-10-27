"use client";

import { useState } from "react";
import type { RideDirection } from "@prisma/client";
import { clearTransitAction, setTransitAction } from "@/app/actions/hangout-transit";
import { useRun } from "@/app/hub/hangouts/[hangoutId]/_components/use-run";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HangoutTransitItem } from "@/lib/hangouts";

export interface TransitStop {
  id: string;
  title: string;
  address: string;
}

const TRIPS: { direction: RideDirection; title: string; short: string }[] = [
  { direction: "PICKUP", title: "Getting there", short: "getting there" },
  { direction: "DROPOFF", title: "Getting home", short: "getting home" },
];

/**
 * Everyone's public transit choices (R5), and for a Going attendee who isn't driving, a form per
 * trip to set or clear their own (R4). Start and destination begin as the profile home.
 */
export function TransitChoice({
  hangoutId,
  transit,
  viewer,
  carsFor,
  stops = [],
}: {
  hangoutId: string;
  transit: HangoutTransitItem[];
  viewer: { id: string; going: boolean; driving: boolean; homeAddress?: string | null };
  /** Driver names of the cars the viewer is on, per direction, so the form can warn about leaving one. */
  carsFor: Record<RideDirection, string | null>;
  /** The hangout's stops that have an address, in order: where getting home can start. */
  stops?: TransitStop[];
}) {
  const canChoose = viewer.going && !viewer.driving;
  if (transit.length === 0 && !canChoose) return null;

  return (
    <section aria-label="Public transit" className="space-y-4">
      <h3 className="text-sm font-medium">Public transit</h3>
      {transit.length > 0 ? (
        <div className="space-y-4">
          {TRIPS.map((trip) => {
            const rows = transit.filter((row) => row.direction === trip.direction);
            return rows.length > 0 ? (
              <div key={trip.direction} className="space-y-2">
                <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {trip.title}
                </p>
                <ul
                  aria-label={`Taking public transit, ${trip.short}`}
                  className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2"
                >
                  {rows.map((row) => (
                    <li
                      key={`${row.userId}-${row.direction}`}
                      className="bg-muted/40 min-w-0 space-y-1 rounded-xl border px-3 py-2.5"
                    >
                      <p className="font-medium">{row.name}</p>
                      <p className="text-muted-foreground break-words">
                        <span className="text-xs font-medium tracking-wide uppercase">From </span>
                        {row.startAddress}
                      </p>
                      {row.destAddress ? (
                        <p className="text-muted-foreground break-words">
                          <span className="text-xs font-medium tracking-wide uppercase">To </span>
                          {row.destAddress}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </div>
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
              stops={stops}
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
  stops,
}: {
  hangoutId: string;
  trip: { direction: RideDirection; title: string; short: string };
  mine: HangoutTransitItem | undefined;
  home: string;
  leaving: string | null;
  stops: TransitStop[];
}) {
  const [isPending, run] = useRun();
  // Getting home starts at the last stop unless the rider picks an earlier one to leave from.
  const [stopId, setStopId] = useState(stops.at(-1)?.id ?? "");
  const [start, setStart] = useState(mine?.startAddress ?? home);
  const [destination, setDestination] = useState(mine?.destAddress ?? home);
  const needsDestination = trip.direction === "DROPOFF";
  const id = `transit-${trip.direction}`;

  return (
    <form
      aria-label={`${trip.title} by public transit`}
      className="space-y-2 rounded-2xl border px-4 py-3 first:mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        run(
          () =>
            setTransitAction(hangoutId, trip.direction, {
              start: needsDestination ? undefined : start,
              startStopId: needsDestination ? stopId : undefined,
              destination,
            }),
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
        {needsDestination ? (
          <div className="flex min-w-44 flex-1 flex-col gap-1">
            {stops.length > 1 ? (
              <Label htmlFor={`${id}-start`} className="text-xs">
                Leaving from
              </Label>
            ) : (
              <span id={`${id}-start-label`} className="text-xs leading-none font-medium">
                Leaving from
              </span>
            )}
            {stops.length > 1 ? (
              <>
                <select
                  id={`${id}-start`}
                  className="border-input bg-background h-9 w-full min-w-0 shrink-0 rounded-md border px-3 text-base max-sm:h-11 md:text-sm"
                  value={stopId}
                  onChange={(event) => setStopId(event.target.value)}
                >
                  {stops.map((stop) => (
                    <option key={stop.id} value={stop.id}>
                      {stop.title} · {stop.address}
                    </option>
                  ))}
                </select>
                <p className="text-muted-foreground text-xs break-words sm:hidden">
                  {stops.find((stop) => stop.id === stopId)?.address}
                </p>
              </>
            ) : stops.length === 1 ? (
              <p aria-labelledby={`${id}-start-label`} className="py-2 text-sm">
                {stops[0].title} · {stops[0].address}
              </p>
            ) : (
              <p id={`${id}-no-stop`} className="text-muted-foreground py-2 text-sm">
                Add an address to a stop in the itinerary first.
              </p>
            )}
          </div>
        ) : (
          <div className="flex min-w-44 flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-start`} className="text-xs">
              Starting from
            </Label>
            <Input
              id={`${id}-start`}
              maxLength={300}
              className="max-sm:h-11"
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </div>
        )}
        {needsDestination ? (
          <div className="flex min-w-44 flex-1 flex-col gap-1">
            <Label htmlFor={`${id}-destination`} className="text-xs">
              Going to
            </Label>
            <Input
              id={`${id}-destination`}
              maxLength={300}
              className="max-sm:h-11"
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
            />
          </div>
        ) : null}
        <Button
          type="submit"
          size="sm"
          variant="outline"
          className="max-sm:h-11 max-sm:w-full"
          aria-describedby={needsDestination && stops.length === 0 ? `${id}-no-stop` : undefined}
          disabled={
            isPending || (needsDestination ? !stopId || !destination.trim() : !start.trim())
          }
        >
          {mine ? "Update" : "Take public transit"}
        </Button>
        {needsDestination && stops.length > 1 ? (
          // On wider screens the address sits on its own row so the two fields stay aligned.
          <p className="text-muted-foreground order-last hidden w-full text-xs break-words sm:block">
            {stops.find((stop) => stop.id === stopId)?.address}
          </p>
        ) : null}
        {mine ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="max-sm:h-11 max-sm:w-full"
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
