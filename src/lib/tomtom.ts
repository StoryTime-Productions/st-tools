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
        legs: { summary: { arrivalTime: string } }[];
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
    };
  } catch {
    return { error: "Routing failed" };
  }
}
