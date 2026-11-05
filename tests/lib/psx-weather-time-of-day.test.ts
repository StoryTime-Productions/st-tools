import { describe, expect, it } from "vitest";
import {
  FALLBACK_SUNRISE,
  FALLBACK_SUNSET,
  clockAt,
  parseClockText,
  parseLocalMinutes,
  todFromMinutes,
} from "@/lib/psx-weather/time-of-day";

describe("todFromMinutes", () => {
  it("is day between sunrise and sunset, with the sun highest at the midpoint", () => {
    const sunrise = 400;
    const sunset = 1000;
    expect(todFromMinutes(sunrise, sunrise, sunset)).toMatchObject({ isDay: true, p: 0 });
    const noon = todFromMinutes(700, sunrise, sunset);
    expect(noon.isDay).toBe(true);
    expect(noon.p).toBeCloseTo(0.5);
    expect(noon.alt).toBeCloseTo(1);
    expect(todFromMinutes(sunset, sunrise, sunset)).toMatchObject({ isDay: true, p: 1 });
  });

  it("is night after sunset and before sunrise, with the moon highest at the midpoint", () => {
    const sunrise = 400;
    const sunset = 1000;
    const nightLength = 1440 - (sunset - sunrise);
    const justAfter = todFromMinutes(sunset + 1, sunrise, sunset);
    expect(justAfter.isDay).toBe(false);
    expect(justAfter.alt).toBeLessThan(0);
    const midnightish = todFromMinutes(sunset + nightLength / 2, sunrise, sunset);
    expect(midnightish.p).toBeCloseTo(0.5);
    expect(midnightish.alt).toBeCloseTo(-1);
    const beforeDawn = todFromMinutes(sunrise - 1, sunrise, sunset);
    expect(beforeDawn.isDay).toBe(false);
    expect(beforeDawn.p).toBeGreaterThan(0.99);
  });

  it("wraps minutes outside one day and defaults to the fallback sun times", () => {
    expect(todFromMinutes(1440 + 700, 400, 1000)).toEqual(todFromMinutes(700, 400, 1000));
    expect(todFromMinutes(-60, 400, 1000)).toEqual(todFromMinutes(1380, 400, 1000));
    expect(todFromMinutes(720)).toEqual(todFromMinutes(720, FALLBACK_SUNRISE, FALLBACK_SUNSET));
  });
});

describe("parseLocalMinutes", () => {
  it("reads the location's local time out of an Open-Meteo timestamp", () => {
    expect(parseLocalMinutes("2026-11-03T09:45")).toBe(585);
    expect(parseLocalMinutes("2026-11-03T00:00")).toBe(0);
    expect(parseLocalMinutes("2026-11-03T23:59")).toBe(1439);
  });

  it("rejects values that are not timestamps", () => {
    expect(parseLocalMinutes(undefined)).toBeNull();
    expect(parseLocalMinutes(42)).toBeNull();
    expect(parseLocalMinutes("not a time")).toBeNull();
    expect(parseLocalMinutes("2026-11-03T25:00")).toBeNull();
    expect(parseLocalMinutes("2026-11-03T10:61")).toBeNull();
  });
});

describe("clockAt", () => {
  it("advances the location clock from the fetch moment", () => {
    expect(clockAt(585, 1_000_000, 1_000_000 + 5 * 60000)).toBeCloseTo(590);
  });

  it("wraps past midnight and never runs backwards", () => {
    expect(clockAt(1435, 0, 10 * 60000)).toBeCloseTo(5);
    expect(clockAt(600, 5000, 1000)).toBe(600);
  });
});

describe("parseClockText", () => {
  it("parses HH:MM and rejects anything else", () => {
    expect(parseClockText("16:45")).toBe(1005);
    expect(parseClockText(" 7:05 ")).toBe(425);
    expect(parseClockText(null)).toBeNull();
    expect(parseClockText("")).toBeNull();
    expect(parseClockText("25:00")).toBeNull();
    expect(parseClockText("10:99")).toBeNull();
    expect(parseClockText("noon")).toBeNull();
  });
});
