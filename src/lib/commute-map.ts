import type { CarPassenger, HangoutCarItem, HangoutTransitItem } from "@/lib/hangouts";
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

/** Where one passenger is met, already resolved to coordinates (null when it isn't on the map). */
export interface MapPassenger {
  name: string;
  position: LatLon | null;
  kind: "home" | "common";
}

export interface MapCar {
  id: string;
  startLat: number | null;
  startLon: number | null;
  schedule: CarSchedule | null;
  driver: MapPerson;
  pickups: MapPassenger[];
  dropoffs: MapPassenger[];
}

/** Someone travelling by public transit; `trip` says which phase their start pin belongs to. */
export interface MapTransit {
  name: string;
  trip: "there" | "back";
  position: LatLon;
}

/** Until transit routing exists the map links out to the regional trip planners. */
export const TRIP_PLANNERS = [
  { label: "STM", url: "https://www.stm.info/en" },
  { label: "exo", url: "https://exo.quebec/en" },
];

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

/** A car as the map needs it; `homeOf` finds another rider's home for "another rider's home" points. */
export function toMapCar(car: HangoutCarItem, homeOf: (userId: string) => LatLon | null): MapCar {
  const resolve = (passenger: CarPassenger): MapPassenger => ({
    name: passenger.name,
    kind: passenger.pointKind === "COMMON" ? "common" : "home",
    position:
      passenger.pointKind === "COMMON"
        ? at(passenger.commonLat, passenger.commonLon)
        : passenger.pointKind === "RIDER_HOME"
          ? passenger.viaUserId
            ? homeOf(passenger.viaUserId)
            : null
          : at(passenger.homeLat, passenger.homeLon),
  });
  return {
    id: car.id,
    startLat: car.startLat,
    startLon: car.startLon,
    schedule: car.schedule,
    driver: { name: car.driver.name, homeLat: car.driver.homeLat, homeLon: car.driver.homeLon },
    pickups: car.pickups.map(resolve),
    dropoffs: car.dropoffs.map(resolve),
  };
}

export function toMapTransit(rows: HangoutTransitItem[]): MapTransit[] {
  return rows.map((row) => ({
    name: row.name,
    trip: row.direction === "PICKUP" ? "there" : "back",
    position: [row.startLat, row.startLon],
  }));
}

/** Everything the commute map draws, from stored data only (no routing calls). */
export function buildCommuteMap(
  stops: MapStop[],
  cars: MapCar[],
  stopRoute: StopRoute | null = null,
  transit: MapTransit[] = []
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
    transit,
    /** Shown in a phase that has transit people, since no transit line is drawn yet (AC 8). */
    planners: transit.length > 0 ? TRIP_PLANNERS : [],
    cars: cars.map((car, index) => {
      // One pin per distinct place and phase; people who share a place share a pin.
      const pins = (["there", "back"] as const).flatMap((trip) => {
        const places = new Map<
          string,
          { names: string[]; position: LatLon; kind: "home" | "common" }
        >();
        for (const { name, position, kind } of trip === "there" ? car.pickups : car.dropoffs) {
          if (!position) continue;
          const key = `${position[0]},${position[1]}`;
          const place = places.get(key);
          if (place) place.names.push(name);
          else places.set(key, { names: [name], position, kind });
        }
        return [...places.values()].map(({ names, position, kind }) => ({
          trip: trip as Trip,
          name: names.join(", "),
          position,
          kind,
        }));
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
      const points = (list: MapPassenger[]) =>
        list.map((p) => p.position).filter((point): point is LatLon => point !== null);
      // Guide lines per phase: out to the first stop, and from the last stop back home (AC 8).
      // A phase with nobody on its list has no line at all (AC 9).
      const guides: { trip: Trip; path: LatLon[] }[] = [
        {
          trip: "there" as const,
          list: car.pickups,
          path: [origin, ...points(car.pickups), ...stopPoints.slice(0, 1)],
        },
        {
          trip: "back" as const,
          list: car.dropoffs,
          path: [...stopPoints.slice(-1), ...points(car.dropoffs), origin],
        },
      ].flatMap(({ trip, list, path }) => {
        const drawable = path.filter((point): point is LatLon => point !== null);
        return list.length > 0 && drawable.length > 1 && (trip === "there" || stopPoints.length > 0)
          ? [{ trip, path: drawable }]
          : [];
      });
      const drawn = needsStart ? [] : dashed ? guides : roads;
      return {
        id: car.id,
        color: CAR_COLORS[index % CAR_COLORS.length],
        driver: car.driver.name,
        dashed,
        needsStart,
        pins,
        lines: drawn.map((line) => line.path),
        /** Which phase each of `lines` belongs to: "there" is Getting there, "back" is Getting home. */
        trips: drawn.map((line) => line.trip),
      };
    }),
  };
}
