import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CommuteMap } from "@/app/hub/hangouts/[hangoutId]/_components/commute-map";
import type { buildCommuteMap } from "@/lib/commute-map";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" }));
const leaflet = vi.hoisted(() => {
  // like Leaflet, a path has no SVG element until the map has a view
  const view = { set: false };
  const layer = () => {
    const element = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const self = {
      options: { weight: 5 } as { weight?: number },
      addTo: vi.fn(() => self),
      bindPopup: vi.fn(() => self),
      bindTooltip: vi.fn(() => self),
      getElement: vi.fn(() => (view.set ? element : undefined)),
      getCenter: vi.fn(() => [1, 2]),
      openTooltip: vi.fn(() => self),
      closeTooltip: vi.fn(() => self),
      setStyle: vi.fn(() => self),
    };
    return self;
  };
  const map = {
    fitBounds: vi.fn<(points: unknown[], options?: unknown) => void>(() => {
      view.set = true;
    }),
    setView: vi.fn<(center: unknown, zoom: number) => void>(() => {
      view.set = true;
    }),
    remove: vi.fn(),
  };
  return {
    map: vi.fn(() => map),
    tileLayer: vi.fn<(url: string, options?: unknown) => ReturnType<typeof layer>>(layer),
    polyline:
      vi.fn<
        (
          line: unknown,
          options?: { dashArray?: string; color?: string; lineCap?: string }
        ) => ReturnType<typeof layer>
      >(layer),
    marker:
      vi.fn<
        (
          position: unknown,
          options?: { interactive?: boolean; keyboard?: boolean }
        ) => ReturnType<typeof layer>
      >(layer),
    divIcon: vi.fn((options: unknown) => options),
    instance: map,
    view,
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
  transit: [],
  planners: [],
  cars: [
    {
      id: "c1",
      color: "#2563eb",
      driver: "Alice",
      dashed: false,
      needsStart: false,
      pins: [{ trip: "there", name: "Bob", position: [4, 4], kind: "home" }],
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
      pins: [],
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
    leaflet.view.set = false;
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

  it("makes each car line a keyboard tab stop that opens its tooltip on focus", async () => {
    render(<CommuteMap data={DATA} hasKey />);
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    const line = leaflet.polyline.mock.results[0].value;
    const element = line.getElement() as SVGElement;

    expect(element.getAttribute("tabindex")).toBe("0");
    expect(element.getAttribute("role")).toBe("img");
    expect(element.getAttribute("aria-label")).toMatch(/Alice's car: Getting there/);

    element.dispatchEvent(new Event("focus"));
    expect(line.openTooltip).toHaveBeenCalledWith([1, 2]);
    expect(line.setStyle).toHaveBeenLastCalledWith({ weight: 8 });
    element.dispatchEvent(new Event("blur"));
    expect(line.closeTooltip).toHaveBeenCalled();
    expect(line.setStyle).toHaveBeenLastCalledWith({ weight: 5 });
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

  it("pins common points as round markers, and only the active phase's pins", async () => {
    const data: MapData = {
      ...DATA,
      cars: [
        {
          ...DATA.cars[0],
          pins: [
            { trip: "there", name: "Bob", position: [4, 4], kind: "common" },
            { trip: "back", name: "Cara", position: [8, 8], kind: "home" },
          ],
        },
      ],
    };
    render(<CommuteMap data={data} hasKey />);
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    const html = () =>
      leaflet.divIcon.mock.calls.map(([options]) => String((options as { html: string }).html));
    expect(html().some((h) => h.includes("rounded-full") && h.includes("●"))).toBe(true);
    expect(html().some((h) => h.includes("⌂"))).toBe(false);

    leaflet.divIcon.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Getting home" }));
    await waitFor(() => expect(html().some((h) => h.includes("⌂"))).toBe(true));
    expect(html().some((h) => h.includes("●"))).toBe(false);
  });

  it("pins transit riders in their phase and links the trip planners there (AC 8)", async () => {
    const data: MapData = {
      ...DATA,
      transit: [
        { userId: "e", name: "Eve", trip: "there", position: [9, 9], color: "#be185d", legs: [] },
        { userId: "f", name: "Finn", trip: "back", position: [7, 7], color: "#a16207", legs: [] },
      ],
      planners: [
        { label: "STM", url: "https://www.stm.info/en" },
        { label: "exo", url: "https://exo.quebec/en" },
      ],
    };
    render(<CommuteMap data={data} hasKey />);
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    expect(screen.getByText(/By public transit: Eve\./)).toBeTruthy();
    expect(screen.queryByText(/Finn/)).toBeNull();
    expect(screen.getByRole("link", { name: "STM" }).getAttribute("href")).toBe(
      "https://www.stm.info/en"
    );
    expect(screen.getByRole("link", { name: "exo" }).getAttribute("target")).toBe("_blank");
    expect(leaflet.instance.fitBounds.mock.calls[0][0]).toContainEqual([9, 9]);

    fireEvent.click(screen.getByRole("button", { name: "Getting home" }));
    await waitFor(() => expect(screen.getByText(/By public transit: Finn\./)).toBeTruthy());
    expect(screen.queryByText(/Eve/)).toBeNull();
  });

  describe("transit lines (T3, AC 1)", () => {
    const WALK = {
      label: "Eve · walk",
      walk: true,
      path: [
        [8, 8],
        [8.5, 8.5],
      ] as [number, number][],
    };
    const METRO = {
      label: "Eve · STM 2",
      walk: false,
      path: [
        [8.5, 8.5],
        [5, 5],
      ] as [number, number][],
    };
    const drawn: MapData = {
      ...DATA,
      cars: [],
      transit: [
        {
          userId: "e",
          name: "Eve",
          trip: "there",
          position: [8, 8],
          color: "#be185d",
          legs: [WALK, METRO],
        },
        {
          userId: "e",
          name: "Eve",
          trip: "back",
          position: [5, 5],
          color: "#be185d",
          legs: [{ ...METRO, label: "Eve · STM 2 (home)" }],
        },
      ],
    };
    const lines = () =>
      leaflet.polyline.mock.calls.map(([path, options], i) => ({
        path,
        options,
        tooltip: (
          leaflet.polyline.mock.results[i].value.bindTooltip.mock.calls[0][0] as HTMLElement
        ).textContent,
      }));

    it("draws each leg in the rider's colour, walking dashed and transit solid with arrows", async () => {
      render(<CommuteMap data={drawn} hasKey />);
      await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());

      expect(lines()).toEqual([
        {
          path: WALK.path,
          options: expect.objectContaining({ color: "#be185d", dashArray: "1 10" }),
          tooltip: "Eve · walk",
        },
        {
          path: METRO.path,
          options: expect.objectContaining({ color: "#be185d", dashArray: undefined }),
          tooltip: "Eve · STM 2",
        },
      ]);
      const arrows = leaflet.marker.mock.calls.filter(([, o]) => o?.interactive === false);
      expect(arrows).toHaveLength(4);
      const bounds = leaflet.instance.fitBounds.mock.calls[0][0];
      expect(bounds).toContainEqual([8.5, 8.5]);
      expect(bounds).toContainEqual([5, 5]);
    });

    it("makes solid transit legs tab stops named for their owner and leaves walk legs out", async () => {
      render(<CommuteMap data={drawn} hasKey />);
      await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());

      const [walk, metro] = leaflet.polyline.mock.results.map(
        (r) => r.value.getElement() as SVGElement
      );
      expect(walk.getAttribute("tabindex")).toBeNull();
      expect(metro.getAttribute("tabindex")).toBe("0");
      expect(metro.getAttribute("aria-label")).toBe("Eve · STM 2");
    });

    it("shows only the active phase's lines and switches without new data", async () => {
      render(<CommuteMap data={drawn} hasKey />);
      await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
      leaflet.polyline.mockClear();

      fireEvent.click(screen.getByRole("button", { name: "Getting home" }));
      await waitFor(() => expect(leaflet.polyline).toHaveBeenCalled());
      expect(lines().map((l) => l.tooltip)).toEqual(["Eve · STM 2 (home)"]);
    });

    it("lists each rider once in the legend and credits the transit data", async () => {
      render(<CommuteMap data={drawn} hasKey />);
      await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());

      const legend = screen.getByRole("list", { name: "Public transit riders" });
      expect(legend.querySelectorAll("li")).toHaveLength(1);
      expect(legend.textContent).toContain("Eve (public transit)");
      expect(screen.getByText(/Transit data: STM, exo/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "CC BY 4.0" })).toHaveAttribute(
        "href",
        "https://www.donneesquebec.ca/licence/#cc-by"
      );
      expect(screen.getByText(/Arrows show the direction of travel/)).toBeTruthy();
      expect(screen.queryByRole("link", { name: "STM" })).toBeNull();
    });

    it("credits nothing and shows no arrows note for a walk-only route", async () => {
      const walkOnly: MapData = {
        ...drawn,
        transit: [{ ...drawn.transit[0], legs: [WALK] }],
      };
      render(<CommuteMap data={walkOnly} hasKey />);
      await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
      expect(screen.queryByText(/Transit data/)).toBeNull();
      expect(screen.queryByText(/Arrows show/)).toBeNull();
    });
  });

  it("shows no transit line when nobody takes transit", async () => {
    render(<CommuteMap data={DATA} hasKey />);
    await waitFor(() => expect(leaflet.instance.fitBounds).toHaveBeenCalled());
    expect(screen.queryByText(/public transit/i)).toBeNull();
  });

  it("uses night tiles in dark mode, centers when empty, and omits empty lists", async () => {
    theme.resolvedTheme = "dark";
    const { unmount } = render(
      <CommuteMap
        data={{ markers: [], notOnMap: [], between: null, transit: [], planners: [], cars: [] }}
        hasKey
      />
    );
    await waitFor(() => expect(leaflet.instance.setView).toHaveBeenCalled());
    expect(leaflet.tileLayer.mock.calls[0][0]).toBe("/api/map-tiles/{z}/{x}/{y}?style=night");
    expect(screen.queryByText(/not on map/i)).toBeNull();
    unmount();
    expect(leaflet.instance.remove).toHaveBeenCalled();
  });
});
