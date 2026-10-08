import { describe, expect, it } from "vitest";
import {
  arrowsAlong,
  buildCommuteMap,
  CAR_COLORS,
  type MapCar,
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

const car = (overrides: Partial<MapCar> = {}): MapCar => ({
  id: "c1",
  startLat: null,
  startLon: null,
  commonLat: null,
  commonLon: null,
  schedule: null,
  driver: person("Alice", 1, 1),
  riders: [],
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

  it("draws manual, failed, unrouted and pre-geometry cars dashed through their points", () => {
    const stops = [stop("Park", 5, 5), stop("Gap", null, null), stop("Bar", 6, 6)];
    const riders = [
      { ...person("Bob", 4, 4), atCommonPoint: false },
      { ...person("Cara"), atCommonPoint: true },
    ];
    const base = car({ startLat: 2, startLon: 2, commonLat: 3, commonLon: 3, riders });
    const expected = [
      [
        [2, 2],
        [4, 4],
        [3, 3],
        [5, 5],
        [6, 6],
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
      expect(mapCar.trips).toEqual([]);
    }
  });

  it("starts at the driver's home, pins riders' exact homes, and cycles colors by car order", () => {
    const cars = Array.from({ length: CAR_COLORS.length + 1 }, (_, i) =>
      car({ id: `c${i}`, riders: [{ ...person("Bob", 4, 4), atCommonPoint: false }] })
    );
    const built = buildCommuteMap([stop("Park", 5, 5)], cars).cars;
    expect(built[0].lines[0][0]).toEqual([1, 1]);
    expect(built[0].homes).toEqual([{ name: "Bob", position: [4, 4] }]);
    expect(built[CAR_COLORS.length].color).toBe(CAR_COLORS[0]);
  });

  it("keeps a car with no usable points in the legend without lines or homes", () => {
    const [mapCar] = buildCommuteMap([], [car({ driver: person("Alice") })]).cars;
    expect(mapCar).toMatchObject({ driver: "Alice", lines: [], homes: [], needsStart: true });
  });

  it("draws no line for a car with no start or home, even with riders, stops or a stored route (AC4)", () => {
    const riders = [{ ...person("Bob", 4, 4), atCommonPoint: false }];
    const noOrigin = car({ driver: person("Alice"), riders });
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
      expect(mapCar.homes).toEqual([{ name: "Bob", position: [4, 4] }]);
    }
  });

  it("does not ask for a start when the car has one or the driver has a home (AC5)", () => {
    const stops = [stop("Park", 5, 5)];
    expect(buildCommuteMap(stops, [car()]).cars[0]).toMatchObject({
      needsStart: false,
      dashed: true,
    });
    const withStart = car({ driver: person("Alice"), startLat: 2, startLon: 2 });
    const [mapCar] = buildCommuteMap(stops, [withStart]).cars;
    expect(mapCar.needsStart).toBe(false);
    expect(mapCar.lines).toHaveLength(1);
  });

  it("skips riders with no home coordinates and common-point riders when there is no common point", () => {
    const [mapCar] = buildCommuteMap(
      [stop("Park", 5, 5)],
      [
        car({
          riders: [
            { ...person("Bob"), atCommonPoint: false },
            { ...person("Cara"), atCommonPoint: true },
          ],
        }),
      ]
    ).cars;
    expect(mapCar.homes).toEqual([]);
    expect(mapCar.lines).toEqual([
      [
        [1, 1],
        [5, 5],
      ],
    ]);
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
});
