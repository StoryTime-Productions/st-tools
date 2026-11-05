import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LiveTimeWeather } from "@/app/dashboard/_components/live-time-weather";

const WEATHER_CACHE_KEY = "dashboard-weather-cache-v1";

type SceneOpts = Record<string, unknown>;
const sceneCalls = vi.hoisted(() => ({ opts: [] as unknown[] }));

// the GPU scene is covered by its own tests; here only what the card hands it matters
vi.mock("@/lib/psx-weather/scene", () => ({
  createPsxScene: vi.fn((_canvas: HTMLCanvasElement, opts: SceneOpts) => {
    sceneCalls.opts.push(opts);
    return { setFrame: vi.fn(), setTime: vi.fn(), dispose: vi.fn() };
  }),
}));

const LOCATION = {
  ok: true,
  json: async () => ({ latitude: 45.5, longitude: -73.6, city: "Montreal", region: "Quebec" }),
} as Response;

function forecast(extra: Record<string, unknown> = {}, code = 63) {
  return {
    ok: true,
    json: async () => ({
      current: { time: "2026-11-03T09:45", temperature_2m: 6, weather_code: code },
      current_units: { temperature_2m: "°C" },
      daily: { sunrise: ["2026-11-03T06:41"], sunset: ["2026-11-03T16:47"] },
      ...extra,
    }),
  } as Response;
}

const lastScene = () => sceneCalls.opts[sceneCalls.opts.length - 1] as SceneOpts;
const flushScene = () => waitFor(() => expect(sceneCalls.opts.length).toBeGreaterThan(0));

describe("LiveTimeWeather scene", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    sceneCalls.opts.length = 0;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("asks the forecast for sunrise and sunset in the location's own timezone", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(LOCATION).mockResolvedValueOnce(forecast());
    render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    const url = String(vi.mocked(fetch).mock.calls[1][0]);
    expect(url).toContain("daily=sunrise,sunset");
    expect(url).toContain("timezone=auto");
  });

  it("builds the scene from the weather code, the location clock and the sun times", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(LOCATION).mockResolvedValueOnce(forecast());
    const { container } = render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    expect(lastScene()).toMatchObject({ condition: "rain", sunrise: 401, sunset: 1007 });
    // 09:45 at the weather location, whatever the viewer's own clock says
    expect(lastScene().minutes).toBeGreaterThanOrEqual(585);
    expect(lastScene().minutes).toBeLessThan(587);
    expect(container.querySelector("canvas")).not.toBeNull();
    expect(screen.getByRole("heading", { name: /Welcome back, Nirav/ })).toBeInTheDocument();
  });

  it("stores the location clock and sun times in the cache and reuses them", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(LOCATION).mockResolvedValueOnce(forecast());
    const first = render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    first.unmount();
    const cached = JSON.parse(window.localStorage.getItem(WEATHER_CACHE_KEY) as string);
    expect(cached.weather).toMatchObject({ localMinutes: 585, sunrise: 401, sunset: 1007 });

    sceneCalls.opts.length = 0;
    render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(lastScene()).toMatchObject({ condition: "rain", sunrise: 401, sunset: 1007 });
  });

  it("keeps working with a cache entry from before sunrise and sunset were stored", async () => {
    window.localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        weather: { temperature: 4, unit: "°C", weatherCode: 71, locationLabel: "Old cache" },
        fetchedAt: Date.now(),
      })
    );
    render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    expect(fetch).not.toHaveBeenCalled();
    expect(lastScene()).toMatchObject({ condition: "snow" });
    const now = new Date();
    const viewerNow = now.getHours() * 60 + now.getMinutes();
    expect(Math.abs((lastScene().minutes as number) - viewerNow)).toBeLessThanOrEqual(2);
  });

  it("discards cache entries whose clock fields are not numbers", async () => {
    window.localStorage.setItem(
      WEATHER_CACHE_KEY,
      JSON.stringify({
        weather: {
          temperature: 4,
          unit: "°C",
          weatherCode: 71,
          locationLabel: "Bad",
          sunrise: "early",
        },
        fetchedAt: Date.now(),
      })
    );
    vi.mocked(fetch).mockResolvedValueOnce(LOCATION).mockResolvedValueOnce(forecast());
    render(<LiveTimeWeather firstName="Nirav" />);
    expect(await screen.findByText("Rain")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("falls back to the viewer's clock only when the forecast has no local time", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(LOCATION)
      .mockResolvedValueOnce(
        forecast({ current: { temperature_2m: 6, weather_code: 0 }, daily: undefined })
      );
    render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    expect(lastScene()).toMatchObject({ condition: "clear" });
    expect(lastScene().sunrise).toBeUndefined();
    expect(lastScene().sunset).toBeUndefined();
    const now = new Date();
    const viewerNow = now.getHours() * 60 + now.getMinutes();
    expect(Math.abs((lastScene().minutes as number) - viewerNow)).toBeLessThanOrEqual(2);
  });

  it("draws no scene while loading or after an error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    const { container } = render(<LiveTimeWeather firstName="Nirav" />);
    expect(container.querySelector("canvas")).toBeNull();
    expect(await screen.findByText("Weather unavailable right now.")).toBeInTheDocument();
    expect(container.querySelector("canvas")).toBeNull();
    expect(sceneCalls.opts).toHaveLength(0);
  });

  it("pins the weather and time from the preview override outside production", async () => {
    window.history.replaceState({}, "", "/?weather=snow&time=23:30");
    vi.mocked(fetch).mockResolvedValueOnce(LOCATION).mockResolvedValueOnce(forecast());
    render(<LiveTimeWeather firstName="Nirav" />);
    await waitFor(() =>
      expect(sceneCalls.opts.some((o) => (o as SceneOpts).condition === "snow")).toBe(true)
    );
    const pinned = sceneCalls.opts.find((o) => (o as SceneOpts).condition === "snow") as SceneOpts;
    expect(pinned.minutes).toBe(1410);
    // the text still reports the real weather
    expect(await screen.findByText("Rain")).toBeInTheDocument();
  });

  it("shows the preview scene even when the weather lookup fails", async () => {
    window.history.replaceState({}, "", "/?weather=storm");
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    const { container } = render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    expect(lastScene()).toMatchObject({ condition: "storm" });
    expect(await screen.findByText("Weather unavailable right now.")).toBeInTheDocument();
    expect(container.querySelector("canvas")).not.toBeNull();
  });

  it("ignores the preview override in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    window.history.replaceState({}, "", "/?weather=snow&time=23:30");
    vi.mocked(fetch).mockResolvedValueOnce(LOCATION).mockResolvedValueOnce(forecast());
    render(<LiveTimeWeather firstName="Nirav" />);
    await flushScene();
    expect(sceneCalls.opts.every((o) => (o as SceneOpts).condition === "rain")).toBe(true);
    expect(lastScene().minutes).toBeLessThan(600);
  });
});
