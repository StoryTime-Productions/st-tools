import { beforeEach, describe, expect, it, vi } from "vitest";

const HOME = { lat: 1, lon: 1 };
const START = { lat: 2, lon: 2 };
const COMMON = { lat: 3, lon: 3 };
const BOB = { lat: 4, lon: 4 };
const CAFE = { lat: 5, lon: 5 };
const BAR = { lat: 6, lon: 6 };

const THERE_PATH: [number, number][] = [
  [2, 2],
  [5, 5],
];
const BACK_PATH: [number, number][] = [
  [6, 6],
  [2, 2],
];

type RouteVia = typeof import("@/lib/tomtom").routeVia;
type StopWeather = import("@/lib/weather").StopWeather;

async function loadModule() {
  const prisma = { hangout: { findUnique: vi.fn() }, hangoutCar: { update: vi.fn() } };
  const routeVia = vi.fn<RouteVia>(async (_origin, waypoints, _dest, time) =>
    "arriveAt" in time
      ? {
          depart: "T18:44",
          arrive: "T19:30",
          waypoints: waypoints.map((_, i) => `T19:0${i}`),
          path: THERE_PATH,
        }
      : {
          depart: "T22:30",
          arrive: "T23:07",
          waypoints: waypoints.map((_, i) => `T22:4${i}`),
          path: BACK_PATH,
        }
  );
  const getStopWeather = vi.fn(
    async (): Promise<StopWeather[]> => [{ status: "none" }, { status: "none" }]
  );
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/tomtom", () => ({ routeVia }));
  vi.doMock("@/lib/weather", async () => ({
    ...(await vi.importActual<typeof import("@/lib/weather")>("@/lib/weather")),
    getStopWeather,
  }));
  const lib = await import("@/lib/routes");
  return { ...lib, prisma, routeVia, getStopWeather };
}

const rider = (userId: string, atCommonPoint: boolean, home: typeof BOB | null) => ({
  userId,
  atCommonPoint,
  user: {
    name: userId === "carol" ? null : userId,
    email: `${userId}@x.gg`,
    homeLat: home?.lat ?? null,
    homeLon: home?.lon ?? null,
  },
});

function car(overrides = {}) {
  return {
    id: "car1",
    startLat: START.lat,
    startLon: START.lon,
    commonLat: COMMON.lat,
    commonLon: COMMON.lon,
    driver: { homeLat: HOME.lat, homeLon: HOME.lon },
    riders: [rider("bob", false, BOB), rider("carol", true, null), rider("dan", true, null)],
    ...overrides,
  };
}

function hangout(overrides = {}) {
  return {
    status: "SCHEDULED",
    startSlot: "2026-10-03T19:30",
    stops: [
      { lat: null, lon: null, durationMinutes: 30, arriveBy: null },
      { ...CAFE, durationMinutes: 120, arriveBy: null },
      { ...BAR, durationMinutes: 120, arriveBy: "1T23:00" },
    ],
    cars: [car()],
    ...overrides,
  };
}

describe("withWeatherDelay", () => {
  const trip = {
    start: "2026-10-03T23:00:00.000Z",
    end: "2026-10-04T00:00:00.000Z",
    stops: { bob: "2026-10-03T23:30:00.000Z" },
  };
  const rain = { percent: 10, reason: "rain" };

  it("leaves the trip alone with no delay or a zero-length drive", async () => {
    const { withWeatherDelay } = await loadModule();
    expect(withWeatherDelay(trip, "there", null)).toBe(trip);
    expect(
      withWeatherDelay({ ...trip, end: trip.start }, "there", rain).delayMinutes
    ).toBeUndefined();
  });

  it("rounds the delay up to whole minutes and scales the pick-ups with the drive", async () => {
    const { withWeatherDelay } = await loadModule();
    const delayed = withWeatherDelay(trip, "there", { percent: 5, reason: "fog" });
    expect(delayed).toMatchObject({
      start: "2026-10-03T22:57:00.000Z",
      end: trip.end,
      delayMinutes: 3,
      reason: "fog",
    });
    expect(delayed.stops.bob).toBe("2026-10-03T23:28:30.000Z");

    const back = withWeatherDelay(trip, "back", rain);
    expect(back).toMatchObject({ start: trip.start, end: "2026-10-04T00:06:00.000Z" });
    expect(back.stops.bob).toBe("2026-10-03T23:33:00.000Z");
  });
});

describe("recomputeRoutes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("routes each car to the first located stop and back from the last one", async () => {
    const { recomputeRoutes, prisma, routeVia } = await loadModule();
    prisma.hangout.findUnique.mockResolvedValue(hangout());

    await recomputeRoutes("h1");

    expect(routeVia).toHaveBeenCalledWith(START, [BOB, COMMON], CAFE, {
      arriveAt: new Date("2026-10-04T00:00:00Z"),
    });
    expect(routeVia).toHaveBeenCalledWith(BAR, [BOB, COMMON], START, {
      departAt: new Date("2026-10-04T05:00:00Z"),
    });
    expect(prisma.hangoutCar.update).toHaveBeenCalledWith({
      where: { id: "car1" },
      data: {
        schedule: {
          there: {
            start: "T18:44",
            end: "T19:30",
            stops: { bob: "T19:00", carol: "T19:01", dan: "T19:01" },
            path: THERE_PATH,
          },
          back: {
            start: "T22:30",
            end: "T23:07",
            stops: { bob: "T22:40", carol: "T22:41", dan: "T22:41" },
            path: BACK_PATH,
          },
        },
      },
    });
  });

  it("starts from the driver's home and stores why a car can't be routed", async () => {
    const { recomputeRoutes, prisma, routeVia } = await loadModule();
    prisma.hangout.findUnique.mockResolvedValue(
      hangout({
        cars: [
          car({ id: "home", startLat: null, startLon: null, riders: [] }),
          car({ id: "nowhere", startLat: null, driver: { homeLat: null, homeLon: null } }),
          car({ id: "lost", commonLat: null, riders: [rider("carol", true, null)] }),
        ],
      })
    );
    routeVia.mockResolvedValueOnce({ error: "Routing failed (429)" });

    await recomputeRoutes("h1");

    expect(routeVia).toHaveBeenCalledWith(HOME, [], CAFE, expect.anything());
    const schedules = Object.fromEntries(
      prisma.hangoutCar.update.mock.calls.map(([call]) => [call.where.id, call.data.schedule])
    );
    expect(schedules).toEqual({
      home: { error: "Routing failed (429)" },
      nowhere: { error: "The car has no start or home address on the map" },
      lost: { error: "carol@x.gg has no home address on the map" },
    });
  });

  it("reports a missing stop address and a failed way back", async () => {
    const { recomputeRoutes, prisma, routeVia } = await loadModule();
    prisma.hangout.findUnique.mockResolvedValueOnce(
      hangout({ stops: [{ lat: null, lon: null, durationMinutes: 30, arriveBy: null }] })
    );
    await recomputeRoutes("h1");
    expect(prisma.hangoutCar.update).toHaveBeenLastCalledWith({
      where: { id: "car1" },
      data: { schedule: { error: "No stop has an address on the map" } },
    });

    prisma.hangout.findUnique.mockResolvedValueOnce(hangout());
    routeVia
      .mockResolvedValueOnce({ depart: "a", arrive: "b", waypoints: [], path: [] })
      .mockResolvedValueOnce({ error: "Routing failed" });
    await recomputeRoutes("h1");
    expect(prisma.hangoutCar.update).toHaveBeenLastCalledWith({
      where: { id: "car1" },
      data: { schedule: { error: "Routing failed" } },
    });
  });

  it("replaces typed-in schedules from before times were computed (T7)", async () => {
    const { recomputeRoutes, prisma, routeVia } = await loadModule();
    const trip = { start: "s", end: "e", stops: { bob: "x", carol: "x", dan: "x" } };
    const manual = { there: trip, back: trip, manual: true };

    routeVia.mockResolvedValueOnce({ error: "Routing failed (429)" });
    prisma.hangout.findUnique.mockResolvedValueOnce(hangout({ cars: [car({ schedule: manual })] }));
    await recomputeRoutes("h1");
    expect(prisma.hangoutCar.update).toHaveBeenLastCalledWith({
      where: { id: "car1" },
      data: { schedule: { error: "Routing failed (429)" } },
    });

    prisma.hangout.findUnique.mockResolvedValueOnce(hangout({ cars: [car({ schedule: manual })] }));
    await recomputeRoutes("h1");
    expect(prisma.hangoutCar.update.mock.lastCall?.[0].data.schedule).not.toHaveProperty("manual");
  });

  it("adds the forecast's delay to both trips, keeping arrival there and departure back (T3)", async () => {
    const { recomputeRoutes, prisma, routeVia, getStopWeather } = await loadModule();
    routeVia.mockImplementation(async (_o, waypoints, _d, time) =>
      "arriveAt" in time
        ? {
            depart: "2026-10-03T23:00:00.000Z",
            arrive: "2026-10-04T00:00:00.000Z",
            waypoints: waypoints.map(() => "2026-10-03T23:30:00.000Z"),
            path: [],
          }
        : {
            depart: "2026-10-04T05:00:00.000Z",
            arrive: "2026-10-04T06:00:00.000Z",
            waypoints: waypoints.map(() => "2026-10-04T05:30:00.000Z"),
            path: [],
          }
    );
    getStopWeather.mockResolvedValueOnce([
      { status: "ok", temperature: 1, chance: 90, code: 63, warnings: [] },
      { status: "ok", temperature: 1, chance: 90, code: 73, warnings: ["Snow"] },
    ]);
    prisma.hangout.findUnique.mockResolvedValueOnce(hangout({ cars: [car()] }));

    await recomputeRoutes("h1");

    expect(getStopWeather).toHaveBeenCalledWith("2026-10-03", [
      { lat: 5, lon: 5, at: 1200, durationMinutes: 1 },
      { lat: 6, lon: 6, at: 1500, durationMinutes: 1 },
    ]);
    const { there, back } = prisma.hangoutCar.update.mock.lastCall?.[0].data.schedule;
    expect(there).toMatchObject({
      start: "2026-10-03T22:54:00.000Z",
      end: "2026-10-04T00:00:00.000Z",
      delayMinutes: 6,
      reason: "rain",
    });
    expect(back).toMatchObject({
      start: "2026-10-04T05:00:00.000Z",
      end: "2026-10-04T06:12:00.000Z",
      delayMinutes: 12,
      reason: "snow",
    });
  });

  it("does nothing for hangouts that aren't scheduled", async () => {
    const { recomputeRoutes, prisma } = await loadModule();
    prisma.hangout.findUnique.mockResolvedValueOnce(hangout({ status: "COLLECTING" }));
    await recomputeRoutes("h1");
    prisma.hangout.findUnique.mockResolvedValueOnce(null);
    await recomputeRoutes("h1");
    expect(prisma.hangoutCar.update).not.toHaveBeenCalled();
  });
});
