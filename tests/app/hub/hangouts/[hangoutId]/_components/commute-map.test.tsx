import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommuteMap } from "@/app/hub/hangouts/[hangoutId]/_components/commute-map";
import type { buildCommuteMap } from "@/lib/commute-map";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" }));
const leaflet = vi.hoisted(() => {
  const layer = () => {
    const self = {
      addTo: vi.fn(() => self),
      bindPopup: vi.fn(() => self),
      bindTooltip: vi.fn(() => self),
    };
    return self;
  };
  const map = {
    fitBounds: vi.fn<(points: unknown[], options?: unknown) => void>(),
    setView: vi.fn<(center: unknown, zoom: number) => void>(),
    remove: vi.fn(),
  };
  return {
    map: vi.fn(() => map),
    tileLayer: vi.fn<(url: string, options?: unknown) => ReturnType<typeof layer>>(layer),
    polyline:
      vi.fn<(line: unknown, options?: { dashArray?: string }) => ReturnType<typeof layer>>(layer),
    marker:
      vi.fn<
        (
          position: unknown,
          options?: { interactive?: boolean; keyboard?: boolean }
        ) => ReturnType<typeof layer>
      >(layer),
    divIcon: vi.fn((options: unknown) => options),
    instance: map,
  };
});

vi.mock("next-themes", () => ({ useTheme: () => theme }));
vi.mock("leaflet", () => ({ default: leaflet, ...leaflet }));
vi.mock("leaflet/dist/leaflet.css", () => ({}));

type MapData = ReturnType<typeof buildCommuteMap>;

const DATA: MapData = {
  markers: [{ number: 1, title: "Park", time: "7:00 PM", position: [5, 5] }],
  notOnMap: ["Mystery"],
  between: null,
  cars: [
    {
      id: "c1",
      color: "#2563eb",
      driver: "Alice",
      dashed: false,
      needsStart: false,
      homes: [{ name: "Bob", position: [4, 4] }],
      lines: [
        [
          [1, 1],
          [5, 5],
        ],
      ],
      trips: ["there"],
    },
    {
      id: "c2",
      color: "#dc2626",
      driver: "Cara",
      dashed: true,
      needsStart: false,
      homes: [],
      lines: [
        [
          [2, 2],
          [5, 5],
        ],
      ],
      trips: [],
    },
  ],
};

const NO_START: MapData = {
  ...DATA,
  cars: [
    {
      ...DATA.cars[0],
      id: "c3",
      driver: "Dan",
      needsStart: true,
      dashed: true,
      lines: [],
      trips: [],
    },
    {
      ...DATA.cars[0],
      id: "c4",
      driver: "Eve",
      needsStart: true,
      dashed: true,
      lines: [],
      trips: [],
    },
  ],
};

describe("CommuteMap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    theme.resolvedTheme = "light";
  });

  it("shows a placeholder and loads nothing without a key", () => {
    render(<CommuteMap data={DATA} hasKey={false} />);
    expect(screen.getByText(/map isn't set up/i)).toBeTruthy();
    expect(leaflet.map).not.toHaveBeenCalled();
  });

  it("draws markers, lines, home pins, and fits the map", async () => {
    render(<CommuteMap data={DATA} hasKey />);
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    expect(leaflet.tileLayer.mock.calls[0][0]).toBe("/api/map-tiles/{z}/{x}/{y}");
    // A marker, a home pin, and four direction arrows on the routed car only.
    expect(leaflet.marker).toHaveBeenCalledTimes(6);
    // Arrows are decoration: Leaflet gives keyboard markers role=button, which axe flags unnamed.
    const arrows = leaflet.marker.mock.calls.filter(
      ([, options]) => options?.interactive === false
    );
    expect(arrows).toHaveLength(4);
    expect(arrows.every(([, options]) => options?.keyboard === false)).toBe(true);
    expect(leaflet.polyline.mock.calls.map(([, options]) => options?.dashArray)).toEqual([
      undefined,
      "8 8",
    ]);
    expect(leaflet.instance.fitBounds.mock.calls[0][0]).toContainEqual([4, 4]);
  });

  it("lists cars with drivers, the copyright, and what's not on the map", () => {
    render(<CommuteMap data={DATA} hasKey />);
    expect(screen.getByText("Alice's car")).toBeTruthy();
    expect(screen.getByText("Cara's car")).toBeTruthy();
    expect(screen.getByText(/arrows show the direction/i)).toBeTruthy();
    expect(screen.getByText("© TomTom")).toBeTruthy();
    expect(screen.getByText("Not on map: Mystery")).toBeTruthy();
  });

  it("says which cars need a start address instead of drawing a line for them (AC4)", async () => {
    const { unmount } = render(<CommuteMap data={NO_START} hasKey />);
    expect(screen.getByText("Needs a start address: Dan's car, Eve's car")).toBeTruthy();
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    expect(leaflet.polyline).not.toHaveBeenCalled();
    unmount();

    render(<CommuteMap data={DATA} hasKey />);
    expect(screen.queryByText(/Needs a start address/)).toBeNull();
  });

  it("shows one phase at a time, defaulting to Getting there, with no routing (AC 1, 7)", async () => {
    const data: MapData = {
      ...DATA,
      cars: [
        {
          ...DATA.cars[0],
          lines: [
            ...DATA.cars[0].lines,
            [
              [5, 5],
              [1, 1],
            ],
          ],
          trips: ["there", "back"],
        },
      ],
    };
    render(<CommuteMap data={data} hasKey />);
    await waitFor(() => expect(leaflet.polyline).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Getting there" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.queryByRole("button", { name: "Between stops" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Getting home" }));
    await waitFor(() => expect(leaflet.polyline).toHaveBeenCalledTimes(2));
    expect(leaflet.polyline.mock.calls[1][0]).toEqual([
      [5, 5],
      [1, 1],
    ]);
  });

  it("draws the between-stops road with leg times, or a dashed guide before a recompute (AC 4, 9)", async () => {
    const legs = [
      {
        from: 1,
        to: 2,
        minutes: 12,
        path: [
          [5, 5],
          [6, 6],
        ] as [number, number][],
      },
    ];
    const { unmount } = render(
      <CommuteMap
        data={{
          ...DATA,
          cars: [],
          between: {
            legs,
            dashed: false,
            guide: [
              [5, 5],
              [6, 6],
            ],
          },
        }}
        hasKey
      />
    );
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Between stops" }));
    await waitFor(() => expect(leaflet.polyline).toHaveBeenCalledTimes(1));
    expect(leaflet.polyline.mock.calls[0][1]?.dashArray).toBeUndefined();
    expect(screen.getByText("Stop 1 to stop 2: 12 min")).toBeTruthy();
    unmount();

    vi.clearAllMocks();
    render(
      <CommuteMap
        data={{
          ...DATA,
          cars: [],
          between: {
            legs: [],
            dashed: true,
            guide: [
              [5, 5],
              [6, 6],
            ],
          },
        }}
        hasKey
      />
    );
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Between stops" }));
    await waitFor(() => expect(leaflet.polyline).toHaveBeenCalledTimes(1));
    expect(leaflet.polyline.mock.calls[0][1]?.dashArray).toBe("8 8");
  });

  it("uses night tiles in dark mode, centers when empty, and omits empty lists", async () => {
    theme.resolvedTheme = "dark";
    const { unmount } = render(
      <CommuteMap data={{ markers: [], notOnMap: [], between: null, cars: [] }} hasKey />
    );
    await waitFor(() => expect(leaflet.instance.setView).toHaveBeenCalled());
    expect(leaflet.tileLayer.mock.calls[0][0]).toBe("/api/map-tiles/{z}/{x}/{y}?style=night");
    expect(screen.queryByText(/not on map/i)).toBeNull();
    unmount();
    expect(leaflet.instance.remove).toHaveBeenCalled();
  });
});
