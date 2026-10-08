import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress, locateAddress, routeLegs, routeVia } from "@/lib/tomtom";

const pt = (latitude: number, longitude: number) => ({ latitude, longitude });

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("geocodeAddress", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("TOMTOM_API_KEY", "tt-key");
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the best match's formatted address and position", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        results: [
          {
            address: { freeformAddress: "290 Bremner Boulevard, Toronto ON M5V 3L9" },
            position: { lat: 43.64, lon: -79.39 },
          },
        ],
      })
    );

    await expect(geocodeAddress("290 Bremner Blvd, Toronto")).resolves.toEqual({
      address: "290 Bremner Boulevard, Toronto ON M5V 3L9",
      lat: 43.64,
      lon: -79.39,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tomtom.com/search/2/search/290%20Bremner%20Blvd%2C%20Toronto.json?limit=1&countrySet=CA&key=tt-key",
      { cache: "no-store" }
    );
  });

  it("keeps a named place's name in front of its address", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        results: [
          {
            poi: { name: "Union Station" },
            address: { freeformAddress: "65 Front Street West, Toronto ON M5J 1E6" },
            position: { lat: 43.64, lon: -79.38 },
          },
        ],
      })
    );

    await expect(geocodeAddress("union station toronto")).resolves.toEqual({
      address: "Union Station, 65 Front Street West, Toronto ON M5J 1E6",
      lat: 43.64,
      lon: -79.38,
    });
  });

  it("tells a real no-match apart from TomTom being unavailable", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { results: [] }));
    await expect(geocodeAddress("zzqq")).resolves.toBe("no-match");

    fetchMock.mockResolvedValueOnce(reply(429, {}));
    await expect(geocodeAddress("zzqq")).resolves.toBeNull();

    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(geocodeAddress("zzqq")).resolves.toBeNull();

    vi.stubEnv("TOMTOM_API_KEY", "");
    await expect(geocodeAddress("zzqq")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("resolves addresses for saving: cleared, unchanged, no match, located or raw text", async () => {
    await expect(locateAddress(null)).resolves.toEqual({ address: null, lat: null, lon: null });
    await expect(locateAddress("12 Elm St", "12 Elm St")).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(reply(200, { results: [] }));
    await expect(locateAddress("zzqq")).resolves.toEqual({
      error: "Couldn't find that address. Check it and try again.",
    });

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        results: [{ address: { freeformAddress: "12 Elm Street" }, position: { lat: 1, lon: 2 } }],
      })
    );
    await expect(locateAddress("12 elm", "old")).resolves.toEqual({
      address: "12 Elm Street",
      lat: 1,
      lon: 2,
    });

    fetchMock.mockResolvedValueOnce(reply(403, {}));
    await expect(locateAddress("12 elm")).resolves.toEqual({
      address: "12 elm",
      lat: null,
      lon: null,
    });
  });

  const A = { lat: 1, lon: 1 };
  const B = { lat: 2, lon: 2 };
  const C = { lat: 3, lon: 3 };
  const D = { lat: 4, lon: 4 };

  it("routes with the best waypoint order and maps arrivals back to the given order", async () => {
    fetchMock.mockResolvedValue(
      reply(200, {
        routes: [
          {
            summary: { departureTime: "T18:44", arrivalTime: "T19:31" },
            legs: [
              { summary: { arrivalTime: "T19:01" }, points: [pt(1, 1), pt(1.5, 1.5)] },
              { summary: { arrivalTime: "T19:11" }, points: [pt(1.5, 1.5), pt(2, 2)] },
              { summary: { arrivalTime: "T19:31" }, points: [pt(2, 2), pt(4, 4)] },
            ],
          },
        ],
        optimizedWaypoints: [
          { providedIndex: 0, optimizedIndex: 1 },
          { providedIndex: 1, optimizedIndex: 0 },
        ],
      })
    );

    await expect(
      routeVia(A, [B, C], D, { arriveAt: new Date("2026-10-03T23:30:00Z") })
    ).resolves.toEqual({
      depart: "T18:44",
      arrive: "T19:31",
      waypoints: ["T19:11", "T19:01"],
      path: [
        [1, 1],
        [4, 4],
      ],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tomtom.com/routing/1/calculateRoute/1,1:2,2:3,3:4,4/json?arriveAt=2026-10-03T23:30:00.000Z&traffic=true&computeBestOrder=true&key=tt-key",
      { cache: "no-store" }
    );
  });

  it("drops points on straight road but keeps turns, such as a loop around a one-way block", async () => {
    // Straight run, a detour around a block, then straight again.
    const straight = Array.from({ length: 500 }, (_, i) => pt(43 + i * 0.0001, -79));
    const loop = [pt(43.05, -79.0005), pt(43.0501, -79.0005), pt(43.0501, -79)];
    const points = [
      ...straight,
      ...loop,
      ...Array.from({ length: 500 }, (_, i) => pt(43.0501 + i * 0.0001, -79)),
    ];
    fetchMock.mockResolvedValue(
      reply(200, {
        routes: [
          {
            summary: { departureTime: "d", arrivalTime: "a" },
            legs: [{ summary: { arrivalTime: "a" }, points }],
          },
        ],
      })
    );
    const route = await routeVia(A, [], D, { departAt: new Date(0) });
    if ("error" in route) throw new Error(route.error);
    expect(route.path.length).toBeLessThan(20);
    expect(route.path[0]).toEqual([43, -79]);
    expect(route.path).toContainEqual([43.05, -79.0005]);
    expect(route.path).toContainEqual([43.0501, -79.0005]);
  });

  it("routes legs between stops in the given order with rounded-up minutes and simplified paths", async () => {
    const straight = Array.from({ length: 300 }, (_, i) => pt(43 + i * 0.0001, -79));
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        routes: [
          {
            legs: [
              { summary: { travelTimeInSeconds: 601 }, points: straight },
              { summary: { travelTimeInSeconds: 600 }, points: [pt(2, 2), pt(3, 3)] },
            ],
          },
        ],
      })
    );
    const legs = await routeLegs([A, B, C], new Date("2026-10-04T02:30:00Z"));
    if ("error" in legs) throw new Error(legs.error);
    expect(legs.map((l) => l.minutes)).toEqual([11, 10]);
    expect(legs[0].path).toEqual([
      [43, -79],
      [43 + 299 * 0.0001, -79],
    ]);
    expect(legs[1].path).toEqual([
      [2, 2],
      [3, 3],
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.tomtom.com/routing/1/calculateRoute/1,1:2,2:3,3/json?departAt=2026-10-04T02:30:00.000Z&traffic=true&key=tt-key",
      { cache: "no-store" }
    );
    expect(fetchMock.mock.calls[0][0]).not.toContain("computeBestOrder");
  });

  it("reports leg routing failures", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, {}));
    await expect(routeLegs([A, B], new Date(0))).resolves.toEqual({
      error: "Routing failed (429)",
    });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(routeLegs([A, B], new Date(0))).resolves.toEqual({ error: "Routing failed" });
    vi.stubEnv("TOMTOM_API_KEY", "");
    await expect(routeLegs([A, B], new Date(0))).resolves.toEqual({
      error: "Routing isn't set up",
    });
  });

  it("departs at a time, keeps a single waypoint in place, and reports failures", async () => {
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        routes: [
          {
            summary: { departureTime: "T22:30", arrivalTime: "T23:07" },
            legs: [
              { summary: { arrivalTime: "T22:42" }, points: [pt(1, 1)] },
              { summary: { arrivalTime: "T23:07" }, points: [pt(4, 4)] },
            ],
          },
        ],
      })
    );
    await expect(
      routeVia(A, [B], D, { departAt: new Date("2026-10-04T02:30:00Z") })
    ).resolves.toEqual({
      depart: "T22:30",
      arrive: "T23:07",
      waypoints: ["T22:42"],
      path: [
        [1, 1],
        [4, 4],
      ],
    });
    expect(fetchMock.mock.calls[0][0]).toContain(
      "departAt=2026-10-04T02:30:00.000Z&traffic=true&computeBestOrder=false"
    );

    fetchMock.mockResolvedValueOnce(reply(403, {}));
    await expect(routeVia(A, [], D, { departAt: new Date(0) })).resolves.toEqual({
      error: "Routing failed (403)",
    });
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(routeVia(A, [], D, { departAt: new Date(0) })).resolves.toEqual({
      error: "Routing failed",
    });
    vi.stubEnv("TOMTOM_API_KEY", "");
    await expect(routeVia(A, [], D, { departAt: new Date(0) })).resolves.toEqual({
      error: "Routing isn't set up",
    });
  });
});
