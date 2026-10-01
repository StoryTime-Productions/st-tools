import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeAddress, locateAddress } from "@/lib/tomtom";

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
      "https://api.tomtom.com/search/2/geocode/290%20Bremner%20Blvd%2C%20Toronto.json?limit=1&key=tt-key",
      { cache: "no-store" }
    );
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
});
