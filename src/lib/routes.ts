import { HangoutStatus, PassengerPointKind, Prisma, RideDirection } from "@prisma/client";
import { addDays, torontoToUtc } from "@/lib/calendar";
import { scheduleStops } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import { routeLegs, routeVia, type Point } from "@/lib/tomtom";
import { getStopWeather, weatherDelay } from "@/lib/weather";

export interface Trip {
  /** ISO times. `stops` maps rider user id to their pick-up (there) or drop-off (back). */
  start: string;
  end: string;
  stops: Record<string, string>;
  /** Road geometry as [lat, lon]; absent on manual trips and on schedules stored before the map. */
  path?: [number, number][];
  /** Minutes the forecast added to this trip's drive (already included in the times above), and why. */
  delayMinutes?: number;
  reason?: string;
}

/**
 * A direction is absent when nobody is on that car's list for it. `manual` is only on schedules
 * typed in before times became computed; they are treated as uncomputed.
 */
export type CarSchedule = { there?: Trip; back?: Trip; manual?: true } | { error: string };

/**
 * Stretch a routed trip by the weather (T3/T4). The arrival of a trip there stays put, so it
 * leaves earlier; a trip back keeps its departure, so it arrives later. Stops scale with the drive.
 */
export function withWeatherDelay(
  trip: Trip,
  direction: "there" | "back",
  delay: { percent: number; reason: string } | null
): Trip {
  if (!delay) return trip;
  const start = Date.parse(trip.start);
  const end = Date.parse(trip.end);
  const drive = end - start;
  const extra = Math.ceil((drive * delay.percent) / 100 / 60_000) * 60_000;
  if (drive <= 0 || extra === 0) return trip;

  const scale = 1 + extra / drive;
  const iso = (ms: number) => new Date(Math.round(ms)).toISOString();
  const stops = Object.fromEntries(
    Object.entries(trip.stops).map(([userId, at]) => {
      const time = Date.parse(at);
      return [
        userId,
        iso(direction === "there" ? end - (end - time) * scale : start + (time - start) * scale),
      ];
    })
  );
  const delayed = { ...trip, stops, delayMinutes: extra / 60_000, reason: delay.reason };
  return direction === "there"
    ? { ...delayed, start: iso(start - extra) }
    : { ...delayed, end: iso(end + extra) };
}

const PERSON = { name: true, email: true, homeLat: true, homeLon: true } as const;

const located = (lat: number | null, lon: number | null): Point | null =>
  lat === null || lon === null ? null : { lat, lon };

/** Route every car of a scheduled hangout both ways and store the result on the car. */
// ponytail: re-routes every car on any change (2 calls per car); go per-car if the 2,500/day quota bites.
export async function recomputeRoutes(hangoutId: string) {
  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: {
      status: true,
      startSlot: true,
      stops: {
        select: { lat: true, lon: true, durationMinutes: true, arriveBy: true },
        orderBy: { position: "asc" },
      },
      cars: {
        select: {
          id: true,
          schedule: true,
          startLat: true,
          startLon: true,
          commonLat: true,
          commonLon: true,
          driver: { select: { homeLat: true, homeLon: true } },
          passengers: {
            select: {
              userId: true,
              direction: true,
              pointKind: true,
              commonLat: true,
              commonLon: true,
              user: { select: PERSON },
              viaUser: { select: PERSON },
            },
          },
        },
      },
    },
  });
  if (hangout?.status !== HangoutStatus.SCHEDULED || !hangout.startSlot) return;

  const { times } = scheduleStops(hangout.startSlot, hangout.stops);
  const startDay = hangout.startSlot.slice(0, 10);
  const instant = (minutes: number) =>
    torontoToUtc(addDays(startDay, Math.floor(minutes / 1440)), minutes % 1440);
  const placed = hangout.stops.flatMap((stop, index) => {
    const point = located(stop.lat, stop.lon);
    const time = times[index];
    return point && "at" in time
      ? [{ point, number: index + 1, at: time.at, end: time.at + stop.durationMinutes }]
      : [];
  });
  const first = placed[0];
  const last = placed[placed.length - 1];

  // Forecast at the arrival stop for the way there and at the last stop's end for the way home.
  const [thereWeather, backWeather] = first
    ? await getStopWeather(startDay, [
        { lat: first.point.lat, lon: first.point.lon, at: first.at, durationMinutes: 1 },
        { lat: last.point.lat, lon: last.point.lon, at: last.end, durationMinutes: 1 },
      ])
    : [];

  for (const car of hangout.cars) {
    const routed = await routeCar(car, first, last, instant);
    const schedule: CarSchedule =
      "error" in routed
        ? routed
        : {
            ...(routed.there && {
              there: withWeatherDelay(routed.there, "there", weatherDelay(thereWeather)),
            }),
            ...(routed.back && {
              back: withWeatherDelay(routed.back, "back", weatherDelay(backWeather)),
            }),
          };
    await prisma.hangoutCar.update({
      where: { id: car.id },
      data: { schedule: schedule as unknown as Prisma.InputJsonValue },
    });
  }

  await routeStops(hangoutId, placed, instant);
}

/** Drive between the located stops, as stored on `hangouts.stopRoute` for the map's between-stops phase. */
export interface StopRoute {
  /** The located stops it was routed through, so a stale route can be told from a current one. */
  points: [number, number][];
  /** `from`/`to` are the 1-based itinerary numbers the map markers use. */
  legs: { from: number; to: number; minutes: number; path: [number, number][] }[];
}

/** Itinerary times are untouched: the drive is informational, so one departure time is enough. */
async function routeStops(
  hangoutId: string,
  placed: { point: Point; number: number; at: number }[],
  instant: (minutes: number) => Date
) {
  if (placed.length < 2) {
    await prisma.hangout.update({
      where: { id: hangoutId },
      data: { stopRoute: Prisma.DbNull },
    });
    return;
  }
  const legs = await routeLegs(
    placed.map((p) => p.point),
    instant(placed[0].at)
  );
  if ("error" in legs) return; // keep the old route; the map ignores one that no longer matches
  const stopRoute: StopRoute = {
    points: placed.map((p): [number, number] => [p.point.lat, p.point.lon]),
    legs: legs.map((leg, i) => ({
      from: placed[i].number,
      to: placed[i + 1].number,
      ...leg,
    })),
  };
  await prisma.hangout.update({
    where: { id: hangoutId },
    data: { stopRoute: stopRoute as unknown as Prisma.InputJsonValue },
  });
}

type RoutablePerson = {
  name: string | null;
  email: string;
  homeLat: number | null;
  homeLon: number | null;
};

type RoutableCar = {
  schedule?: unknown;
  startLat: number | null;
  startLon: number | null;
  driver: { homeLat: number | null; homeLon: number | null };
  passengers: {
    userId: string;
    direction: RideDirection;
    pointKind: PassengerPointKind;
    commonLat: number | null;
    commonLon: number | null;
    user: RoutablePerson;
    viaUser: RoutablePerson | null;
  }[];
};

/** Where the driver meets one passenger, or why that can't be mapped. */
function passengerPoint(passenger: RoutableCar["passengers"][number]): Point | { error: string } {
  const who = (person: RoutablePerson) => person.name ?? person.email;
  if (passenger.pointKind === PassengerPointKind.COMMON) {
    return (
      located(passenger.commonLat, passenger.commonLon) ?? {
        error: `${who(passenger.user)}'s meeting point isn't on the map`,
      }
    );
  }
  const owner = passenger.pointKind === PassengerPointKind.RIDER_HOME ? passenger.viaUser : null;
  const person = owner ?? passenger.user;
  return (
    located(person.homeLat, person.homeLon) ?? {
      error: `${who(person)} has no home address on the map`,
    }
  );
}

/** One waypoint per distinct place; passengers who share a place share the arrival time. */
function waypointsFor(
  passengers: RoutableCar["passengers"]
): { point: Point; riders: string[] }[] | { error: string } {
  const waypoints = new Map<string, { point: Point; riders: string[] }>();
  for (const passenger of passengers) {
    const point = passengerPoint(passenger);
    if ("error" in point) return point;
    const key = `${point.lat},${point.lon}`;
    const shared = waypoints.get(key);
    if (shared) shared.riders.push(passenger.userId);
    else waypoints.set(key, { point, riders: [passenger.userId] });
  }
  return [...waypoints.values()];
}

async function routeCar(
  car: RoutableCar,
  first: { point: Point; at: number } | undefined,
  last: { point: Point; end: number } | undefined,
  instant: (minutes: number) => Date
): Promise<CarSchedule> {
  if (!first || !last) return { error: "No stop has an address on the map" };
  const origin =
    located(car.startLat, car.startLon) ?? located(car.driver.homeLat, car.driver.homeLon);
  if (!origin) return { error: "The car has no start or home address on the map" };

  const pickups = waypointsFor(car.passengers.filter((p) => p.direction === RideDirection.PICKUP));
  if ("error" in pickups) return pickups;
  const dropoffs = waypointsFor(
    car.passengers.filter((p) => p.direction === RideDirection.DROPOFF)
  );
  if ("error" in dropoffs) return dropoffs;

  const trip = (
    waypoints: { point: Point; riders: string[] }[],
    route: (points: Point[]) => ReturnType<typeof routeVia>
  ) => (waypoints.length ? route(waypoints.map((w) => w.point)) : Promise.resolve(null));
  const [there, back] = await Promise.all([
    trip(pickups, (points) =>
      routeVia(origin, points, first.point, { arriveAt: instant(first.at) })
    ),
    trip(dropoffs, (points) =>
      routeVia(last.point, points, origin, { departAt: instant(last.end) })
    ),
  ]);
  if (there && "error" in there) return there;
  if (back && "error" in back) return back;

  const toTrip = (
    waypoints: { riders: string[] }[],
    route: NonNullable<typeof there> & { depart: string }
  ): Trip => ({
    start: route.depart,
    end: route.arrive,
    stops: Object.fromEntries(
      waypoints.flatMap((w, index) => w.riders.map((userId) => [userId, route.waypoints[index]]))
    ),
    path: route.path,
  });
  return {
    ...(there && { there: toTrip(pickups, there) }),
    ...(back && { back: toTrip(dropoffs, back) }),
  };
}
