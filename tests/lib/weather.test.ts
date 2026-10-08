import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStopWeather,
  hourWarnings,
  summarizeHours,
  weatherDelay,
  type HourForecast,
  type StopWeather,
} from "@/lib/weather";

const calm: HourForecast = {
  temperature: 12.4,
  precipitationChance: 10,
  snowfall: 0,
  gusts: 20,
  code: 1,
};

describe("hourWarnings", () => {
  it("is quiet for calm weather and just under the thresholds", () => {
    expect(hourWarnings(calm)).toEqual([]);
    expect(hourWarnings({ ...calm, precipitationChance: 49, gusts: 59.9 })).toEqual([]);
  });

  it("flags snow, 50% precipitation, 60 km/h gusts, thunder and freezing rain", () => {
    expect(hourWarnings({ ...calm, snowfall: 0.1 })).toEqual(["Snow"]);
    expect(hourWarnings({ ...calm, precipitationChance: 50 })).toEqual(["50% precipitation"]);
    expect(hourWarnings({ ...calm, gusts: 60.2 })).toEqual(["Gusts 60 km/h"]);
    expect(hourWarnings({ ...calm, code: 95 })).toEqual(["Thunderstorm"]);
    expect(hourWarnings({ ...calm, code: 66 })).toEqual(["Freezing rain"]);
  });
});

describe("weatherDelay", () => {
  const ok = (code: number, warnings: string[] = []): StopWeather => ({
    status: "ok",
    temperature: 1,
    chance: 0,
    code,
    warnings,
  });

  it("charges a percentage of the drive per condition (T4)", () => {
    expect(weatherDelay(ok(1))).toBeNull();
    expect(weatherDelay(ok(61))).toEqual({ percent: 10, reason: "rain" });
    expect(weatherDelay(ok(45))).toEqual({ percent: 10, reason: "fog" });
    expect(weatherDelay(ok(95))).toEqual({ percent: 15, reason: "thunderstorm" });
    expect(weatherDelay(ok(73))).toEqual({ percent: 20, reason: "snow" });
    expect(weatherDelay(ok(1, ["Snow"]))).toEqual({ percent: 20, reason: "snow" });
    expect(weatherDelay(ok(66))).toEqual({ percent: 20, reason: "freezing rain" });
    expect(weatherDelay(ok(1, ["Thunderstorm"]))).toEqual({ percent: 15, reason: "thunderstorm" });
  });

  it("adds nothing without a usable forecast", () => {
    expect(weatherDelay(undefined)).toBeNull();
    expect(weatherDelay({ status: "unavailable" })).toBeNull();
    expect(weatherDelay({ status: "far" })).toBeNull();
  });
});

describe("summarizeHours", () => {
  it("takes the first hour's conditions, the worst chance and every distinct warning", () => {
    expect(
      summarizeHours([
        calm,
        { ...calm, precipitationChance: 70, snowfall: 1 },
        { ...calm, snowfall: 2 },
      ])
    ).toEqual({
      status: "ok",
      temperature: 12,
      chance: 70,
      code: 1,
      warnings: ["Snow", "70% precipitation"],
    });
    expect(summarizeHours([])).toEqual({ status: "none" });
  });
});

function openMeteo(hours: Record<string, Partial<HourForecast>>) {
  const times = Object.keys(hours);
  const pick = <K extends keyof HourForecast>(key: K) =>
    times.map((time) => hours[time][key] ?? calm[key]);
  return {
    ok: true,
    json: async () => ({
      hourly: {
        time: times.map((time) => `${time}:00`),
        temperature_2m: pick("temperature"),
        precipitation_probability: pick("precipitationChance"),
        snowfall: pick("snowfall"),
        wind_gusts_10m: pick("gusts"),
        weather_code: pick("code"),
      },
    }),
  };
}

describe("getStopWeather", () => {
  const today = "2026-10-02";
  afterEach(() => vi.unstubAllGlobals());

  it("checks every hour a stop spans, one request per location", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      openMeteo({
        "2026-10-03T19": {},
        "2026-10-03T20": { snowfall: 1 },
        "2026-10-03T21": {},
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStopWeather(
      "2026-10-03",
      [
        { lat: 43.6532, lon: -79.3832, at: 19 * 60 + 30, durationMinutes: 90 },
        { lat: 43.6532, lon: -79.3832, at: 21 * 60, durationMinutes: 30 },
      ],
      today
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get("latitude")).toBe("43.65");
    expect(url.searchParams.get("timezone")).toBe("America/Toronto");
    expect(url.searchParams.get("start_date")).toBe("2026-10-03");
    expect(result[0]).toMatchObject({ status: "ok", warnings: ["Snow"] });
    expect(result[1]).toMatchObject({ status: "ok", warnings: [] });
  });

  it("reports stops with no map position, no clock time, or beyond the horizon", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getStopWeather(
      "2026-10-30",
      [
        { lat: null, lon: null, at: 600, durationMinutes: 60 },
        { lat: 43.6, lon: -79.4, at: null, durationMinutes: 60 },
        { lat: 43.6, lon: -79.4, at: 600, durationMinutes: 60 },
      ],
      today
    );

    expect(result).toEqual([{ status: "none" }, { status: "none" }, { status: "far" }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to unavailable when Open-Meteo errors, is down, or returns no hours", async () => {
    const stop = { lat: 43.6, lon: -79.4, at: 600, durationMinutes: 60 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await getStopWeather("2026-10-03", [stop], today)).toEqual([{ status: "unavailable" }]);

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    expect(await getStopWeather("2026-10-03", [stop], today)).toEqual([{ status: "unavailable" }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await getStopWeather("2026-10-03", [stop], today)).toEqual([{ status: "unavailable" }]);
  });

  it("spans midnight into day two", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(openMeteo({ "2026-10-03T23": {}, "2026-10-04T00": { code: 99 } }));
    vi.stubGlobal("fetch", fetchMock);

    const [stop] = await getStopWeather(
      "2026-10-03",
      [{ lat: 43.6, lon: -79.4, at: 23 * 60, durationMinutes: 120 }],
      today
    );

    expect(stop).toMatchObject({ status: "ok", warnings: ["Thunderstorm"] });
    expect(new URL(fetchMock.mock.calls[0][0]).searchParams.get("end_date")).toBe("2026-10-04");
  });
});
