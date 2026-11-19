import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./otp-itinerary.json";
import { decodePolyline, planTransit } from "@/lib/otp";

const from = { lat: 45.5003, lon: -73.5683 };
const to = { lat: 45.493, lon: -73.629 };

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

describe("decodePolyline", () => {
  it("decodes the reference polyline", () => {
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });

  it("returns an empty path for an empty string", () => {
    expect(decodePolyline("")).toEqual([]);
  });
});

describe("planTransit", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OTP_URL", "http://otp.test/");
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "");
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is off without OTP_URL and never calls out", async () => {
    vi.stubEnv("OTP_URL", "");
    await expect(planTransit({ from, to, arriveAt: new Date() })).resolves.toEqual({
      error: "off",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the quickest itinerary as walk, subway, walk with decoded paths", async () => {
    fetchMock.mockResolvedValue(reply(200, fixture));

    const plan = await planTransit({ from, to, arriveAt: new Date("2026-10-14T13:00:00Z") });

    if ("error" in plan) throw new Error(plan.error);
    expect(plan.minutes).toBe(32);
    expect(plan.legs.map((leg) => leg.mode)).toEqual(["WALK", "SUBWAY", "WALK"]);
    expect(plan.legs[1]).toMatchObject({
      agency: "Société de transport de Montréal",
      line: "2",
      from: { name: "Station Bonaventure" },
      to: { name: "Station Côte-Sainte-Catherine" },
    });
    expect(plan.legs[0].agency).toBeUndefined();
    expect(plan.legs[0].path.length).toBeGreaterThan(2);
  });

  it("keeps the first itinerary when it is already the quickest", async () => {
    const [slow, quick] = fixture.data.plan.itineraries;
    fetchMock.mockResolvedValue(reply(200, { data: { plan: { itineraries: [quick, slow] } } }));

    const plan = await planTransit({ from, to, departAt: new Date() });

    expect(plan).toMatchObject({ minutes: 32 });
  });

  it("sends Toronto wall-clock time with arriveBy for arrive-at", async () => {
    fetchMock.mockResolvedValue(reply(200, fixture));

    await planTransit({ from, to, arriveAt: new Date("2026-10-14T13:05:00Z") });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://otp.test/otp/gtfs/v1");
    expect(JSON.parse(init.body).variables).toMatchObject({
      date: "2026-10-14",
      time: "09:05",
      arriveBy: true,
    });
    expect(init.headers).not.toHaveProperty("CF-Access-Client-Id");
  });

  it("sends depart-at as arriveBy false", async () => {
    fetchMock.mockResolvedValue(reply(200, fixture));

    await planTransit({ from, to, departAt: new Date("2026-10-15T02:30:00Z") });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body).variables).toMatchObject({
      date: "2026-10-14",
      time: "22:30",
      arriveBy: false,
    });
  });

  it("sends the Cloudflare Access token when both parts are set", async () => {
    vi.stubEnv("CF_ACCESS_CLIENT_ID", "id");
    vi.stubEnv("CF_ACCESS_CLIENT_SECRET", "secret");
    fetchMock.mockResolvedValue(reply(200, fixture));

    await planTransit({ from, to, departAt: new Date() });

    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      "CF-Access-Client-Id": "id",
      "CF-Access-Client-Secret": "secret",
    });
  });

  it("falls back to the long name when a route has no short name", async () => {
    const itinerary = structuredClone(fixture.data.plan.itineraries[1]);
    itinerary.legs[1].route = { shortName: null, longName: "Orange" } as never;
    fetchMock.mockResolvedValue(reply(200, { data: { plan: { itineraries: [itinerary] } } }));

    const plan = await planTransit({ from, to, departAt: new Date() });

    if ("error" in plan) throw new Error(plan.error);
    expect(plan.legs[1].line).toBe("Orange");
  });

  it("reports an HTTP failure", async () => {
    fetchMock.mockResolvedValue(reply(503, {}));
    await expect(planTransit({ from, to, departAt: new Date() })).resolves.toEqual({
      error: "otp 503",
    });
  });

  it("reports no itineraries", async () => {
    fetchMock.mockResolvedValue(reply(200, { data: { plan: { itineraries: [] } } }));
    await expect(planTransit({ from, to, departAt: new Date() })).resolves.toEqual({
      error: "no route",
    });
  });

  it("reports GraphQL errors with no data as no route", async () => {
    fetchMock.mockResolvedValue(reply(200, { errors: [{ message: "bad" }] }));
    await planTransit({ from, to, departAt: new Date() });
    fetchMock.mockResolvedValue(reply(200, { data: { plan: null } }));
    await expect(planTransit({ from, to, departAt: new Date() })).resolves.toEqual({
      error: "no route",
    });
  });

  it("never throws when the service is unreachable", async () => {
    fetchMock.mockRejectedValue(new Error("timeout"));
    await expect(planTransit({ from, to, departAt: new Date() })).resolves.toEqual({
      error: "unreachable",
    });
  });
});
