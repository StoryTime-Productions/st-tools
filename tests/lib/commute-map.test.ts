import { describe, expect, it } from "vitest";
import {
  arrowsAlong,
  buildCommuteMap,
  toMapCar,
  toMapTransit,
  CAR_COLORS,
  type MapCar,
  type MapPassenger,
  type MapStop,
} from "@/lib/commute-map";

const stop = (title: string, lat: number | null, lon: number | null): MapStop => ({
  title,
  lat,
  lon,
  time: "7:00 PM",
});

const person = (name: string, lat: number | null = null, lon: number | null = null) => ({
  name,
  homeLat: lat,
  homeLon: lon,
});

const home = (name: string, position: [number, number] | null): MapPassenger => ({
  name,
  position,
  kind: "home",
});
const common = (name: string, position: [number, number] | null): MapPassenger => ({
  name,
  position,
  kind: "common",
});

const car = (overrides: Partial<MapCar> = {}): MapCar => ({
  id: "c1",
  startLat: null,
  startLon: null,
  schedule: null,
  driver: person("Alice", 1, 1),
  pickups: [],
  dropoffs: [],
  ...overrides,
});

const trip = (path?: [number, number][]) => ({ start: "a", end: "b", stops: {}, path });

describe("buildCommuteMap", () => {
  it("numbers located stops in itinerary order and lists the rest as not on map", () => {
    const { markers, notOnMap } = buildCommuteMap(
      [stop("Park", 5, 5), stop("Mystery", null, null), stop("Bar", 6, 6)],
      []
    );
    expect(markers).toEqual([
      { number: 1, title: "Park", time: "7:00 PM", position: [5, 5] },
      { number: 3, title: "Bar", time: "7:00 PM", position: [6, 6] },
    ]);
    expect(notOnMap).toEqual(["Mystery"]);
  });

  it("draws a routed car's road geometry in a palette color, no dashes", () => {
    const [mapCar] = buildCommuteMap(
      [],
      [
        car({
          schedule: {
            there: trip([
              [1, 1],
              [2, 2],
            ]),
            back: trip([
              [2, 2],
              [1, 1],
            ]),
          },
        }),
      ]
    ).cars;
    expect(mapCar).toMatchObject({ color: CAR_COLORS[0], driver: "Alice", dashed: false });
    expect(mapCar.lines).toHaveLength(2);
    expect(mapCar.trips).toEqual(["there", "back"]);
  });

  it("draws manual, failed, unrouted and pre-geometry cars dashed through each phase's own list (AC 8)", () => {
    const stops = [stop("Park", 5, 5), stop("Gap", null, null), stop("Bar", 6, 6)];
    const base = car({
      startLat: 2,
      startLon: 2,
      pickups: [home("Bob", [4, 4]), common("Cara", [3, 3])],
      dropoffs: [home("Bob", [4, 4]), home("Dan", [7, 7])],
    });
    const expected = [
      [
        [2, 2],
        [4, 4],
        [3, 3],
        [5, 5],
      ],
      [
        [6, 6],
        [4, 4],
        [7, 7],
        [2, 2],
      ],
    ];
    for (const schedule of [
      null,
      { error: "Routing failed" },
      { there: trip(), back: trip(), manual: true as const },
      { there: trip(), back: trip() },
    ]) {
      const [mapCar] = buildCommuteMap(stops, [{ ...base, schedule }]).cars;
      expect(mapCar.dashed).toBe(true);
      expect(mapCar.lines).toEqual(expected);
      expect(mapCar.trips).toEqual(["there", "back"]);
    }
  });

  it("draws no line for a phase with nobody on its list (AC 9)", () => {
    const stops = [stop("Park", 5, 5)];
    const thereOnly = car({ pickups: [home("Bob", [4, 4])] });
    expect(buildCommuteMap(stops, [thereOnly]).cars[0].trips).toEqual(["there"]);
    expect(buildCommuteMap(stops, [car()]).cars[0]).toMatchObject({ lines: [], trips: [] });
    // A routed car with only a Getting home trip draws only that road.
    const routedBack = car({
      dropoffs: [home("Bob", [4, 4])],
      schedule: {
        back: trip([
          [5, 5],
          [1, 1],
        ]),
      },
    });
    expect(buildCommuteMap(stops, [routedBack]).cars[0]).toMatchObject({
      dashed: false,
      trips: ["back"],
    });
  });

  it("starts at the driver's home, pins each phase's exact points, and cycles colors by car order", () => {
    const cars = Array.from({ length: CAR_COLORS.length + 1 }, (_, i) =>
      car({ id: `c${i}`, pickups: [home("Bob", [4, 4])], dropoffs: [home("Cara", [8, 8])] })
    );
    const built = buildCommuteMap([stop("Park", 5, 5)], cars).cars;
    expect(built[0].lines[0][0]).toEqual([1, 1]);
    expect(built[0].pins).toEqual([
      { trip: "there", name: "Bob", position: [4, 4], kind: "home" },
      { trip: "back", name: "Cara", position: [8, 8], kind: "home" },
    ]);
    expect(built[CAR_COLORS.length].color).toBe(CAR_COLORS[0]);
  });

  it("shares one pin between riders at the same place and keeps common points distinct", () => {
    const [mapCar] = buildCommuteMap(
      [],
      [car({ pickups: [common("Bob", [3, 3]), common("Cara", [3, 3]), home("Dan", [4, 4])] })]
    ).cars;
    expect(mapCar.pins).toEqual([
      { trip: "there", name: "Bob, Cara", position: [3, 3], kind: "common" },
      { trip: "there", name: "Dan", position: [4, 4], kind: "home" },
    ]);
  });

  it("keeps a car with no usable points in the legend without lines or pins", () => {
    const [mapCar] = buildCommuteMap([], [car({ driver: person("Alice") })]).cars;
    expect(mapCar).toMatchObject({ driver: "Alice", lines: [], pins: [], needsStart: true });
  });

  it("draws no line for a car with no start or home, even with riders, stops or a stored route (AC4)", () => {
    const noOrigin = car({
      driver: person("Alice"),
      pickups: [home("Bob", [4, 4])],
      dropoffs: [home("Bob", [4, 4])],
    });
    const routed = {
      there: trip([
        [1, 1],
        [2, 2],
      ]),
      back: trip([
        [2, 2],
        [1, 1],
      ]),
    };
    for (const schedule of [null, { error: "no start" }, routed]) {
      const [mapCar] = buildCommuteMap([stop("Park", 5, 5)], [{ ...noOrigin, schedule }]).cars;
      expect(mapCar).toMatchObject({ lines: [], trips: [], needsStart: true });
      expect(mapCar.pins).toHaveLength(2);
    }
  });

  it("does not ask for a start when the car has one or the driver has a home (AC5)", () => {
    const stops = [stop("Park", 5, 5)];
    const riders = { pickups: [home("Bob", [4, 4])], dropoffs: [home("Bob", [4, 4])] };
    expect(buildCommuteMap(stops, [car(riders)]).cars[0]).toMatchObject({
      needsStart: false,
      dashed: true,
    });
    const withStart = car({ ...riders, driver: person("Alice"), startLat: 2, startLon: 2 });
    const [mapCar] = buildCommuteMap(stops, [withStart]).cars;
    expect(mapCar.needsStart).toBe(false);
    expect(mapCar.lines).toHaveLength(2);
  });

  it("skips passengers that aren't on the map but still draws the phase", () => {
    const [mapCar] = buildCommuteMap(
      [stop("Park", 5, 5)],
      [car({ pickups: [home("Bob", null)], dropoffs: [common("Cara", null)] })]
    ).cars;
    expect(mapCar.pins).toEqual([]);
    expect(mapCar.lines).toEqual([
      [
        [1, 1],
        [5, 5],
      ],
      [
        [5, 5],
        [1, 1],
      ],
    ]);
    expect(mapCar.trips).toEqual(["there", "back"]);
  });

  describe("public transit (AC 8)", () => {
    it("passes transit pins through with trip planner links, and none without transit", () => {
      const rider = { name: "Eve", trip: "there" as const, position: [9, 9] as [number, number] };
      const withTransit = buildCommuteMap([], [], null, [rider]);
      expect(withTransit.transit).toEqual([rider]);
      expect(withTransit.planners.map((p) => p.label)).toEqual(["STM", "exo"]);
      expect(buildCommuteMap([], []).planners).toEqual([]);
    });

    it("maps transit rows to the matching phase at their start", () => {
      const row = {
        userId: "e",
        name: "Eve",
        startAddress: "x",
        startLat: 9,
        startLon: 8,
        destAddress: null,
        destLat: null,
        destLon: null,
      };
      expect(
        toMapTransit([
          { ...row, direction: "PICKUP" },
          { ...row, direction: "DROPOFF" },
        ])
      ).toEqual([
        { name: "Eve", trip: "there", position: [9, 8] },
        { name: "Eve", trip: "back", position: [9, 8] },
      ]);
    });
  });

  describe("toMapCar", () => {
    const passenger = (overrides: Record<string, unknown>) => ({
      userId: "b",
      name: "Bob",
      homeAddress: null,
      homeLat: 4,
      homeLon: 4,
      pointKind: "HOME",
      viaUserId: null,
      commonLabel: null,
      commonLat: null,
      commonLon: null,
      ...overrides,
    });
    const item = (pickups: ReturnType<typeof passenger>[]) =>
      ({
        id: "c1",
        startLat: 2,
        startLon: 2,
        schedule: null,
        driver: { userId: "a", name: "Alice", homeAddress: null, homeLat: 1, homeLon: 1 },
        pickups,
        dropoffs: [],
      }) as unknown as Parameters<typeof toMapCar>[0];

    it("resolves a home, another rider's home and a common point to coordinates", () => {
      const mapCar = toMapCar(
        item([
          passenger({}),
          passenger({ name: "Dan", pointKind: "RIDER_HOME", viaUserId: "c" }),
          passenger({ name: "Cara", pointKind: "COMMON", commonLat: 3, commonLon: 3 }),
        ]),
        (userId) => (userId === "c" ? [7, 7] : null)
      );
      expect(mapCar.driver).toEqual(person("Alice", 1, 1));
      expect(mapCar.pickups).toEqual([
        home("Bob", [4, 4]),
        home("Dan", [7, 7]),
        common("Cara", [3, 3]),
      ]);
    });

    it("leaves a point null when it can't be placed", () => {
      const mapCar = toMapCar(
        item([
          passenger({ homeLat: null }),
          passenger({ pointKind: "RIDER_HOME", viaUserId: null }),
          passenger({ pointKind: "RIDER_HOME", viaUserId: "gone" }),
          passenger({ pointKind: "COMMON" }),
        ]),
        () => null
      );
      expect(mapCar.pickups.map((p) => p.position)).toEqual([null, null, null, null]);
    });
  });
});

describe("arrowsAlong", () => {
  it("spaces arrows evenly and points them the way the path runs", () => {
    const east = arrowsAlong(
      [
        [0, 0],
        [0, 5],
      ],
      4
    );
    expect(east.map((arrow) => arrow.position[1])).toEqual([1, 2, 3, 4]);
    expect(east.every((arrow) => Math.round(arrow.bearing) === 90)).toBe(true);

    const south = arrowsAlong(
      [
        [5, 0],
        [0, 0],
      ],
      1
    );
    expect(Math.round(south[0].bearing)).toBe(180);
  });

  it("follows a bend and gives nothing for an empty path", () => {
    const [arrow] = arrowsAlong(
      [
        [0, 0],
        [0, 2],
        [2, 2],
      ],
      1
    );
    expect(arrow.position[0]).toBeCloseTo(0);
    expect(arrow.position[1]).toBeCloseTo(2);
    expect(arrowsAlong([[1, 1]])).toEqual([]);
  });

  describe("between stops", () => {
    const stops = [stop("Park", 5, 5), stop("Gap", null, null), stop("Bar", 6, 6)];
    const route = {
      points: [
        [5, 5],
        [6, 6],
      ] as [number, number][],
      legs: [
        {
          from: 1,
          to: 3,
          minutes: 9,
          path: [
            [5, 5],
            [5.5, 5.5],
            [6, 6],
          ] as [number, number][],
        },
      ],
    };

    it("is null with fewer than two located stops (AC 5)", () => {
      expect(buildCommuteMap([stop("Park", 5, 5)], []).between).toBeNull();
      expect(buildCommuteMap([], [], route).between).toBeNull();
    });

    it("uses the stored road legs while they match the located stops", () => {
      expect(buildCommuteMap(stops, [], route).between).toEqual({
        legs: route.legs,
        dashed: false,
        guide: [
          [5, 5],
          [6, 6],
        ],
      });
    });

    it("falls back to a dashed guide with no route or a stale one (AC 9)", () => {
      const guide = [
        [5, 5],
        [6, 6],
      ];
      expect(buildCommuteMap(stops, []).between).toEqual({ legs: [], dashed: true, guide });
      const stale = {
        ...route,
        points: [
          [5, 5],
          [7, 7],
        ] as [number, number][],
      };
      expect(buildCommuteMap(stops, [], stale).between).toEqual({ legs: [], dashed: true, guide });
      const longer = { ...route, points: [...route.points, [8, 8]] as [number, number][] };
      expect(buildCommuteMap(stops, [], longer).between?.dashed).toBe(true);
    });
  });
});
