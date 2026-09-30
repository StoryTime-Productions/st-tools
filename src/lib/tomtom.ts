export interface GeocodedAddress {
  address: string;
  lat: number;
  lon: number;
}

/** Best TomTom match, "no-match", or null when TomTom can't be used (no key, 403/429, outage). */
export async function geocodeAddress(query: string): Promise<GeocodedAddress | "no-match" | null> {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return null;

  const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(query)}.json?limit=1&key=${key}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const { results } = (await response.json()) as {
      results?: { address: { freeformAddress: string }; position: { lat: number; lon: number } }[];
    };
    const best = results?.[0];
    if (!best) return "no-match";
    return { address: best.address.freeformAddress, ...best.position };
  } catch {
    return null;
  }
}
