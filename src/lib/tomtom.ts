export interface GeocodedAddress {
  address: string;
  lat: number;
  lon: number;
}

/** Best TomTom fuzzy-search match in Canada (addresses and named places), "no-match", or null when TomTom can't be used (no key, 403/429, outage). */
export async function geocodeAddress(query: string): Promise<GeocodedAddress | "no-match" | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;

  const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(query)}.json?limit=1&countrySet=CA&key=${key}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const { results } = (await response.json()) as {
      results?: {
        poi?: { name: string };
        address: { freeformAddress: string };
        position: { lat: number; lon: number };
      }[];
    };
    const best = results?.[0];
    if (!best) return "no-match";
    const address = best.address.freeformAddress;
    return { address: best.poi ? `${best.poi.name}, ${address}` : address, ...best.position };
  } catch {
    return null;
  }
}

/**
 * Resolve a typed address for saving: null when it is unchanged from `previous`,
 * cleared fields for an empty one, an error for no match, the raw text without
 * coordinates when TomTom is unavailable.
 */
export async function locateAddress(address: string | null, previous?: string | null) {
  if (!address) return { address: null, lat: null, lon: null };
  if (address === previous) return null;
  const match = await geocodeAddress(address);
  if (match === "no-match") return { error: "Couldn't find that address. Check it and try again." };
  return { address: match?.address ?? address, lat: match?.lat ?? null, lon: match?.lon ?? null };
}

export interface Point {
  lat: number;
  lon: number;
}

export interface Route {
  depart: string;
  arrive: string;
  /** Arrival at each waypoint, in the order the waypoints were given. */
  waypoints: string[];
  /** Road geometry as [lat, lon], simplified without losing turns, capped at MAX_PATH_POINTS. */
  path: [number, number][];
}

const MAX_PATH_POINTS = 4000;
// ~2 m: drops points on straight road but keeps every turn, so detours around one-way blocks survive.
const PATH_TOLERANCE = 0.00002;

function offLine(p: [number, number], a: [number, number], b: [number, number]) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker; thinning by index would cut the small loops a route makes around one-way blocks. */
function simplify(path: [number, number][], tolerance: number): [number, number][] {
  if (path.length < 3) return path;
  const keep = new Set([0, path.length - 1]);
  const pending: [number, number][] = [[0, path.length - 1]];
  while (pending.length > 0) {
    const [from, to] = pending.pop()!;
    let far = -1;
    let farDistance = tolerance;
    for (let i = from + 1; i < to; i++) {
      const distance = offLine(path[i], path[from], path[to]);
      if (distance > farDistance) [far, farDistance] = [i, distance];
    }
    if (far < 0) continue;
    keep.add(far);
    pending.push([from, far], [far, to]);
  }
  return path.filter((_, i) => keep.has(i));
}

function thin<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  return Array.from(
    { length: max },
    (_, i) => items[Math.round((i * (items.length - 1)) / (max - 1))]
  );
}

/** One car trip with the best waypoint order, live traffic, and either an arrival or departure time. */
export async function routeVia(
  origin: Point,
  waypoints: Point[],
  destination: Point,
  time: { arriveAt: Date } | { departAt: Date }
): Promise<Route | { error: string }> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return { error: "Routing isn't set up" };

  const points = [origin, ...waypoints, destination].map((p) => `${p.lat},${p.lon}`).join(":");
  const when =
    "arriveAt" in time
      ? `arriveAt=${time.arriveAt.toISOString()}`
      : `departAt=${time.departAt.toISOString()}`;
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${points}/json?${when}&traffic=true&computeBestOrder=${waypoints.length > 1}&key=${key}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return { error: `Routing failed (${response.status})` };
    const { routes, optimizedWaypoints } = (await response.json()) as {
      routes: {
        summary: { departureTime: string; arrivalTime: string };
        legs: {
          summary: { arrivalTime: string };
          points: { latitude: number; longitude: number }[];
        }[];
      }[];
      optimizedWaypoints?: { providedIndex: number; optimizedIndex: number }[];
    };
    const [route] = routes;
    const legOf = (index: number) =>
      optimizedWaypoints?.find((w) => w.providedIndex === index)?.optimizedIndex ?? index;
    return {
      depart: route.summary.departureTime,
      arrive: route.summary.arrivalTime,
      waypoints: waypoints.map((_, index) => route.legs[legOf(index)].summary.arrivalTime),
      path: thin(
        simplify(
          route.legs.flatMap((leg) =>
            leg.points.map((p): [number, number] => [p.latitude, p.longitude])
          ),
          PATH_TOLERANCE
        ),
        MAX_PATH_POINTS
      ),
    };
  } catch {
    return { error: "Routing failed" };
  }
}
