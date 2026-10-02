import { HangoutStatus, type Prisma } from "@prisma/client";
import { addDays, torontoToUtc } from "@/lib/calendar";
import { scheduleStops } from "@/lib/itinerary";
import { prisma } from "@/lib/prisma";
import { routeVia, type Point } from "@/lib/tomtom";

export interface Trip {
  /** ISO times. `stops` maps rider user id to their pick-up (there) or drop-off (back). */
  start: string;
  end: string;
  stops: Record<string, string>;
}

export type CarSchedule = { there: Trip; back: Trip; manual?: true } | { error: string };

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
          riders: {
            select: {
              userId: true,
              atCommonPoint: true,
              user: { select: { name: true, email: true, homeLat: true, homeLon: true } },
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
      ? [{ point, at: time.at, end: time.at + stop.durationMinutes }]
      : [];
  });
  const first = placed[0];
  const last = placed[placed.length - 1];

  for (const car of hangout.cars) {
    const routed = await routeCar(car, first, last, instant);
    // Manual times are only a fallback (M6): keep them when routing fails and they still cover every rider.
    const kept = car.schedule as CarSchedule | null;
    const schedule =
      "error" in routed &&
      kept &&
      "manual" in kept &&
      car.riders.every(
        (rider) => rider.userId in kept.there.stops && rider.userId in kept.back.stops
      )
        ? kept
        : routed;
    await prisma.hangoutCar.update({
      where: { id: car.id },
      data: { schedule: schedule as unknown as Prisma.InputJsonValue },
    });
  }
}

type RoutableCar = {
  schedule?: unknown;
  startLat: number | null;
  startLon: number | null;
  commonLat: number | null;
  commonLon: number | null;
  driver: { homeLat: number | null; homeLon: number | null };
  riders: {
    userId: string;
    atCommonPoint: boolean;
    user: { name: string | null; email: string; homeLat: number | null; homeLon: number | null };
  }[];
};

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

  const common = located(car.commonLat, car.commonLon);
  const waypoints: { point: Point; riders: string[] }[] = [];
  for (const rider of car.riders) {
    if (rider.atCommonPoint && common) {
      const shared = waypoints.find((w) => w.point === common);
      if (shared) shared.riders.push(rider.userId);
      else waypoints.push({ point: common, riders: [rider.userId] });
      continue;
    }
    const home = located(rider.user.homeLat, rider.user.homeLon);
    if (!home)
      return { error: `${rider.user.name ?? rider.user.email} has no home address on the map` };
    waypoints.push({ point: home, riders: [rider.userId] });
  }

  const points = waypoints.map((w) => w.point);
  const [there, back] = await Promise.all([
    routeVia(origin, points, first.point, { arriveAt: instant(first.at) }),
    routeVia(last.point, points, origin, { departAt: instant(last.end) }),
  ]);
  if ("error" in there) return there;
  if ("error" in back) return back;

  const byRider = (arrivals: string[]) =>
    Object.fromEntries(
      waypoints.flatMap((w, index) => w.riders.map((userId) => [userId, arrivals[index]]))
    );
  return {
    there: { start: there.depart, end: there.arrive, stops: byRider(there.waypoints) },
    back: { start: back.depart, end: back.arrive, stops: byRider(back.waypoints) },
  };
}
