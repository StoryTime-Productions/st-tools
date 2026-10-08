import type { CarSchedule, StopRoute } from "@/lib/routes";

export type LatLon = [number, number];

export interface MapStop {
  title: string;
  lat: number | null;
  lon: number | null;
  /** Already formatted for the popup. */
  time: string;
}

interface MapPerson {
  name: string;
  homeLat: number | null;
  homeLon: number | null;
}

export interface MapCar {
  id: string;
  startLat: number | null;
  startLon: number | null;
  commonLat: number | null;
  commonLon: number | null;
  schedule: CarSchedule | null;
  driver: MapPerson;
  riders: (MapPerson & { atCommonPoint: boolean })[];
}

export type Trip = "there" | "back";

/** Direction arrows spaced evenly by distance along a path; `bearing` is degrees clockwise from north. */
export function arrowsAlong(path: LatLon[], count = 4) {
  const km = (a: LatLon, b: LatLon) =>
    Math.hypot((b[1] - a[1]) * Math.cos(((a[0] + b[0]) / 2) * (Math.PI / 180)), b[0] - a[0]);
  const lengths = path.slice(1).map((point, i) => km(path[i], point));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (total === 0) return [];
  return Array.from({ length: count }, (_, n) => {
    let left = (total * (n + 1)) / (count + 1);
    let i = 0;
    while (i < lengths.length - 1 && left > lengths[i]) left -= lengths[i++];
    const [from, to] = [path[i], path[i + 1]];
    const t = lengths[i] === 0 ? 0 : left / lengths[i];
    const east = (to[1] - from[1]) * Math.cos(((from[0] + to[0]) / 2) * (Math.PI / 180));
    return {
      position: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t] as LatLon,
      bearing: (Math.atan2(east, to[0] - from[0]) * 180) / Math.PI,
    };
  });
}

export const CAR_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

const at = (lat: number | null, lon: number | null): LatLon | null =>
  lat === null || lon === null ? null : [lat, lon];

/** Everything the commute map draws, from stored data only (no routing calls). */
export function buildCommuteMap(
  stops: MapStop[],
  cars: MapCar[],
  stopRoute: StopRoute | null = null
) {
  const markers = stops.flatMap((stop, index) => {
    const position = at(stop.lat, stop.lon);
    return position ? [{ number: index + 1, title: stop.title, time: stop.time, position }] : [];
  });
  const stopPoints = markers.map((marker) => marker.position);
  const notOnMap = stops.filter((stop) => !at(stop.lat, stop.lon)).map((stop) => stop.title);

  // A stored route only counts while it was routed through exactly the stops now located (AC 9).
  const current =
    stopRoute !== null &&
    stopRoute.points.length === stopPoints.length &&
    stopRoute.points.every(
      (point, i) => point[0] === stopPoints[i][0] && point[1] === stopPoints[i][1]
    );
  const between =
    stopPoints.length < 2
      ? null
      : { legs: current ? stopRoute.legs : [], dashed: !current, guide: stopPoints };

  return {
    markers,
    notOnMap,
    between,
    cars: cars.map((car, index) => {
      const common = at(car.commonLat, car.commonLon);
      const homes = car.riders.flatMap((rider) => {
        const position = rider.atCommonPoint ? null : at(rider.homeLat, rider.homeLon);
        return position ? [{ name: rider.name, position }] : [];
      });
      const roads: { trip: Trip; path: LatLon[] }[] =
        car.schedule && !("error" in car.schedule) && !car.schedule.manual
          ? [
              { trip: "there" as const, path: car.schedule.there?.path },
              { trip: "back" as const, path: car.schedule.back?.path },
            ].flatMap(({ trip, path }) => (path?.length ? [{ trip, path }] : []))
          : [];
      const origin = at(car.startLat, car.startLon) ?? at(car.driver.homeLat, car.driver.homeLon);
      // A car that starts nowhere draws nothing, so a line never implies a route that was not computed.
      const needsStart = origin === null;
      const dashed = roads.length === 0;
      const riderPoints = car.riders
        .map((rider) => (rider.atCommonPoint ? common : at(rider.homeLat, rider.homeLon)))
        .filter((point): point is LatLon => point !== null);
      // Guide lines per phase: out to the first stop, and from the last stop back home (AC 8).
      const guides: { trip: Trip; path: LatLon[] }[] = [
        { trip: "there", path: [origin, ...riderPoints, ...stopPoints.slice(0, 1)] },
        { trip: "back", path: [...stopPoints.slice(-1), ...riderPoints, origin] },
      ].flatMap(({ trip, path }) => {
        const points = path.filter((point): point is LatLon => point !== null);
        return points.length > 1 && (trip === "there" || stopPoints.length > 0)
          ? [{ trip: trip as Trip, path: points }]
          : [];
      });
      const drawn = needsStart ? [] : dashed ? guides : roads;
      return {
        id: car.id,
        color: CAR_COLORS[index % CAR_COLORS.length],
        driver: car.driver.name,
        dashed,
        needsStart,
        homes,
        lines: drawn.map((line) => line.path),
        /** Which phase each of `lines` belongs to: "there" is Getting there, "back" is Getting home. */
        trips: drawn.map((line) => line.trip),
      };
    }),
  };
}
