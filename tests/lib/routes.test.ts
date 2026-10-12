import { Prisma } from "@prisma/client";
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
type RouteLegs = typeof import("@/lib/tomtom").routeLegs;
type StopWeather = import("@/lib/weather").StopWeather;

async function loadModule() {
  const prisma = {
    hangout: { findUnique: vi.fn(), update: vi.fn() },
    hangoutCar: { update: vi.fn() },
  };
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
  const routeLegs = vi.fn<RouteLegs>(async (points) =>
    points.slice(1).map((_, i) => ({ minutes: 10 + i, path: [[i, i]] }))
  );
  const getStopWeather = vi.fn(
    async (): Promise<StopWeather[]> => [{ status: "none" }, { status: "none" }]
  );
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/tomtom", () => ({ routeVia, routeLegs }));
  vi.doMock("@/lib/weather", async () => ({
    ...(await vi.importActual<typeof import("@/lib/weather")>("@/lib/weather")),
    getStopWeather,
  }));
  const lib = await import("@/lib/routes");
  return { ...lib, prisma, routeVia, routeLegs, getStopWeather };
}

type Kind = "HOME" | "RIDER_HOME" | "COMMON";

const person = (userId: string, home: typeof BOB | null) => ({
  name: userId === "carol" ? null : userId,
  email: `${userId}@x.gg`,
  homeLat: home?.lat ?? null,
  homeLon: home?.lon ?? null,
});

const passenger = (
  userId: string,
  direction: "PICKUP" | "DROPOFF",
  pointKind: Kind,
  home: typeof BOB | null,
  extra: { via?: ReturnType<typeof person>; common?: typeof COMMON | null } = {}
) => ({
  userId,
  direction,
  pointKind,
  commonLat: extra.common === undefined ? null : (extra.common?.lat ?? null),
  commonLon: extra.common === undefined ? null : (extra.common?.lon ?? null),
  user: person(userId, home),
  viaUser: extra.via ?? null,
});

/** The same person on both lists, like a migrated rider. */
const both = (
  userId: string,
  pointKind: Kind,
  home: typeof BOB | null,
  extra: Parameters<typeof passenger>[4] = {}
) => [
  passenger(userId, "PICKUP", pointKind, home, extra),
  passenger(userId, "DROPOFF", pointKind, home, extra),
];

function car(overrides = {}) {
  return {
    id: "car1",
    startLat: START.lat,
    startLon: START.lon,
    driver: { homeLat: HOME.lat, homeLon: HOME.lon },
    passengers: [
      ...both("bob", "HOME", BOB),
      ...both("carol", "COMMON", null, { common: COMMON }),
      ...both("dan", "COMMON", null, { common: COMMON }),
    ],
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
          car({
            id: "home",
            startLat: null,
            startLon: null,
            passengers: [passenger("bob", "PICKUP", "HOME", BOB)],
          }),
          car({ id: "nowhere", startLat: null, driver: { homeLat: null, homeLon: null } }),
          car({
            id: "lost",
            passengers: [passenger("carol", "PICKUP", "COMMON", null, { common: null })],
          }),
          car({ id: "nohome", passengers: [passenger("carol", "DROPOFF", "HOME", null)] }),
        ],
      })
    );

    await recomputeRoutes("h1");

    expect(routeVia).toHaveBeenCalledWith(HOME, [BOB], CAFE, expect.anything());
    const schedules = Object.fromEntries(
      prisma.hangoutCar.update.mock.calls.map(([call]) => [call.where.id, call.data.schedule])
    );
    expect(schedules).toEqual({
      home: expect.objectContaining({ there: expect.anything() }),
      nowhere: { error: "The car has no start or home address on the map" },
      lost: { error: "carol@x.gg's meeting point isn't on the map" },
      nohome: { error: "carol@x.gg has no home address on the map" },
    });
    expect(schedules.home).not.toHaveProperty("back");
  });

  it("gives a direction with nobody on its list no trip at all (AC9)", async () => {
    const { recomputeRoutes, prisma, routeVia } = await loadModule();
    prisma.hangout.findUnique.mockResolvedValue(
      hangout({
        cars: [
          car({ id: "empty", passengers: [] }),
          car({ id: "backOnly", passengers: [passenger("bob", "DROPOFF", "HOME", BOB)] }),
        ],
      })
    );

    await recomputeRoutes("h1");

    const schedules = Object.fromEntries(
      prisma.hangoutCar.update.mock.calls.map(([call]) => [call.where.id, call.data.schedule])
    );
    expect(schedules.empty).toEqual({});
    expect(Object.keys(schedules.backOnly)).toEqual(["back"]);
    expect(routeVia).toHaveBeenCalledTimes(1);
  });

  it("uses another rider's home for a rider-home point and times each list on its own", async () => {
    const { recomputeRoutes, prisma, routeVia } = await loadModule();
    const carolHome = { lat: 7, lon: 7 };
    prisma.hangout.findUnique.mockResolvedValue(
      hangout({
        cars: [
          car({
            passengers: [
              passenger("bob", "PICKUP", "HOME", BOB),
              passenger("dan", "PICKUP", "RIDER_HOME", null, { via: person("carol", carolHome) }),
              passenger("carol", "PICKUP", "HOME", carolHome),
              passenger("dan", "DROPOFF", "HOME", BOB),
            ],
          }),
        ],
      })
    );

    await recomputeRoutes("h1");

    expect(routeVia).toHaveBeenCalledWith(START, [BOB, carolHome], CAFE, expect.anything());
    expect(routeVia).toHaveBeenCalledWith(BAR, [BOB], START, expect.anything());
    const { there, back } = prisma.hangoutCar.update.mock.lastCall?.[0].data.schedule;
    // dan and carol share a place, so they share a time.
    expect(there.stops).toEqual({ bob: "T19:00", dan: "T19:01", carol: "T19:01" });
    expect(back.stops).toEqual({ dan: "T22:40" });
  });

  it("reports a rider-home point whose owner has no home on the map", async () => {
    const { recomputeRoutes, prisma } = await loadModule();
    prisma.hangout.findUnique.mockResolvedValue(
      hangout({
        cars: [
          car({
            passengers: [
              passenger("dan", "PICKUP", "RIDER_HOME", null, { via: person("carol", null) }),
            ],
          }),
        ],
      })
    );

    await recomputeRoutes("h1");

    expect(prisma.hangoutCar.update.mock.lastCall?.[0].data.schedule).toEqual({
      error: "carol@x.gg has no home address on the map",
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

  describe("stop route", () => {
    const stopRouteWrites = (prisma: { hangout: { update: ReturnType<typeof vi.fn> } }) =>
      prisma.hangout.update.mock.calls.map(([arg]) => arg.data.stopRoute);

    it("stores one leg per consecutive located pair, using itinerary numbers", async () => {
      const { recomputeRoutes, prisma, routeLegs } = await loadModule();
      prisma.hangout.findUnique.mockResolvedValue(hangout());

      await recomputeRoutes("h1");

      // Stop 1 has no address, so the stored leg is 2 -> 3, leaving at the first located stop's start.
      expect(routeLegs).toHaveBeenCalledWith([CAFE, BAR], new Date("2026-10-04T00:00:00Z"));
      expect(prisma.hangout.update).toHaveBeenCalledWith({
        where: { id: "h1" },
        data: {
          stopRoute: {
            points: [
              [5, 5],
              [6, 6],
            ],
            legs: [{ from: 2, to: 3, minutes: 10, path: [[0, 0]] }],
          },
        },
      });
    });

    it("stores two legs for three located stops, with no cars, and leaves the times alone", async () => {
      const { recomputeRoutes, prisma } = await loadModule();
      const stops = [
        { ...HOME, durationMinutes: 30, arriveBy: null },
        { ...CAFE, durationMinutes: 60, arriveBy: null },
        { ...BAR, durationMinutes: 60, arriveBy: null },
      ];
      prisma.hangout.findUnique.mockResolvedValue(hangout({ stops, cars: [] }));

      await recomputeRoutes("h1");

      const [route] = stopRouteWrites(prisma);
      expect(route.legs.map((l: { from: number; to: number }) => [l.from, l.to])).toEqual([
        [1, 2],
        [2, 3],
      ]);
      expect(prisma.hangoutCar.update).not.toHaveBeenCalled();
      expect(prisma.hangout.update).toHaveBeenCalledTimes(1);
    });

    it("clears the route with fewer than two located stops", async () => {
      const { recomputeRoutes, prisma, routeLegs } = await loadModule();
      const stops = [{ ...CAFE, durationMinutes: 60, arriveBy: null }];
      prisma.hangout.findUnique.mockResolvedValue(hangout({ stops, cars: [] }));

      await recomputeRoutes("h1");

      expect(routeLegs).not.toHaveBeenCalled();
      expect(stopRouteWrites(prisma)).toEqual([Prisma.DbNull]);
    });

    it("keeps the old route when routing fails", async () => {
      const { recomputeRoutes, prisma, routeLegs } = await loadModule();
      routeLegs.mockResolvedValueOnce({ error: "Routing failed (429)" });
      prisma.hangout.findUnique.mockResolvedValue(hangout());

      await recomputeRoutes("h1");

      expect(prisma.hangout.update).not.toHaveBeenCalled();
    });
  });
});
