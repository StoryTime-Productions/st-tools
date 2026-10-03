import type { CarSchedule } from "@/lib/routes";

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

export const CAR_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];

const at = (lat: number | null, lon: number | null): LatLon | null =>
  lat === null || lon === null ? null : [lat, lon];

/** Everything the commute map draws, from stored data only (no routing calls). */
export function buildCommuteMap(stops: MapStop[], cars: MapCar[]) {
  const markers = stops.flatMap((stop, index) => {
    const position = at(stop.lat, stop.lon);
    return position ? [{ number: index + 1, title: stop.title, time: stop.time, position }] : [];
  });
  const stopPoints = markers.map((marker) => marker.position);
  const notOnMap = stops.filter((stop) => !at(stop.lat, stop.lon)).map((stop) => stop.title);

  return {
    markers,
    notOnMap,
    cars: cars.map((car, index) => {
      const common = at(car.commonLat, car.commonLon);
      const homes = car.riders.flatMap((rider) => {
        const position = rider.atCommonPoint ? null : at(rider.homeLat, rider.homeLon);
        return position ? [{ name: rider.name, position }] : [];
      });
      const roads =
        car.schedule && "there" in car.schedule && !car.schedule.manual
          ? [car.schedule.there.path, car.schedule.back.path].filter((path) => path?.length)
          : [];
      const dashed = roads.length === 0;
      const through = [
        at(car.startLat, car.startLon) ?? at(car.driver.homeLat, car.driver.homeLon),
        ...car.riders.map((rider) =>
          rider.atCommonPoint ? common : at(rider.homeLat, rider.homeLon)
        ),
        ...stopPoints,
      ].filter((point): point is LatLon => point !== null);
      return {
        id: car.id,
        color: CAR_COLORS[index % CAR_COLORS.length],
        driver: car.driver.name,
        dashed,
        homes,
        lines: dashed ? (through.length > 1 ? [through] : []) : (roads as LatLon[][]),
      };
    }),
  };
}
