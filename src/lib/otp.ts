import type { Point } from "@/lib/tomtom";

export interface TransitLeg {
  mode: string;
  agency?: string;
  line?: string;
  from: { name: string } & Point;
  to: { name: string } & Point;
  path: [number, number][];
}

export interface TransitPlan {
  start: string;
  end: string;
  minutes: number;
  legs: TransitLeg[];
}

export type TransitResult = TransitPlan | { error: string };

interface PlaceDto {
  name: string;
  lat: number;
  lon: number;
}

interface ItineraryDto {
  start: string;
  end: string;
  duration: number;
  legs: {
    mode: string;
    from: PlaceDto;
    to: PlaceDto;
    agency: { name: string } | null;
    route: { shortName: string | null; longName: string } | null;
    legGeometry: { points: string };
  }[];
}

const TIMEOUT_MS = 10_000;

const QUERY = `query($from: InputCoordinates!, $to: InputCoordinates!, $date: String!, $time: String!, $arriveBy: Boolean!) {
  plan(from: $from, to: $to, date: $date, time: $time, arriveBy: $arriveBy, transportModes: [{mode: WALK}, {mode: TRANSIT}]) {
    itineraries { start end duration legs { mode from { name lat lon } to { name lat lon } agency { name } route { shortName longName } legGeometry { points } } }
  }
}`;

/** Google's encoded polyline (precision 5) to [lat, lon] pairs. */
export function decodePolyline(encoded: string): [number, number][] {
  const path: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lon += next();
    path.push([lat / 1e5, lon / 1e5]);
  }
  return path;
}

/** OTP wants the Toronto wall-clock date and time (Montreal shares the zone). */
function torontoParts(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/**
 * Plan a public-transit trip with the self-hosted OpenTripPlanner. Pass exactly one of
 * `arriveAt` / `departAt`. Never throws: `{error}` when OTP is off, down or finds nothing.
 */
export async function planTransit(trip: {
  from: Point;
  to: Point;
  arriveAt?: Date;
  departAt?: Date;
}): Promise<TransitResult> {
  const url = process.env.OTP_URL;
  if (!url) return { error: "off" };

  const arriveBy = Boolean(trip.arriveAt);
  const when = torontoParts((trip.arriveAt ?? trip.departAt)!);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { CF_ACCESS_CLIENT_ID: id, CF_ACCESS_CLIENT_SECRET: secret } = process.env;
  if (id && secret) {
    headers["CF-Access-Client-Id"] = id;
    headers["CF-Access-Client-Secret"] = secret;
  }

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/otp/gtfs/v1`, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        query: QUERY,
        variables: {
          from: { lat: trip.from.lat, lon: trip.from.lon },
          to: { lat: trip.to.lat, lon: trip.to.lon },
          ...when,
          arriveBy,
        },
      }),
    });
    if (!response.ok) return { error: `otp ${response.status}` };
    const body = (await response.json()) as {
      data?: { plan?: { itineraries?: ItineraryDto[] } };
    };
    // OTP can list a long all-walking itinerary first; the quickest one is what the card wants.
    const itineraries = body.data?.plan?.itineraries ?? [];
    if (itineraries.length === 0) return { error: "no route" };
    const best = itineraries.reduce((a, b) => (b.duration < a.duration ? b : a));
    return {
      start: best.start,
      end: best.end,
      minutes: Math.round(best.duration / 60),
      legs: best.legs.map((leg) => ({
        mode: leg.mode,
        ...(leg.agency && { agency: leg.agency.name }),
        ...(leg.route && { line: leg.route.shortName ?? leg.route.longName }),
        from: leg.from,
        to: leg.to,
        path: decodePolyline(leg.legGeometry.points),
      })),
    };
  } catch {
    return { error: "unreachable" };
  }
}
