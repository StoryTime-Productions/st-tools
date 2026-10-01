import { describe, expect, it } from "vitest";
import { dayAndClock, scheduleStops, spanDays } from "@/lib/itinerary";

const stop = (durationMinutes: number, arriveBy: string | null = null) => ({
  durationMinutes,
  arriveBy,
});

describe("scheduleStops", () => {
  it("chains stops from the locked start and ends after the last duration", () => {
    expect(scheduleStops("2026-10-03T19:30", [stop(30), stop(90), stop(15)])).toEqual({
      times: [
        { at: 1170, lateBy: 0 },
        { at: 1200, lateBy: 0 },
        { at: 1290, lateBy: 0 },
      ],
      end: 1305,
    });
  });

  it("lets an arrive-by win, warns when running late, and chains from it into day 2", () => {
    expect(
      scheduleStops("2026-10-03T19:30", [stop(60), stop(120, "1T20:10"), stop(60, "1T23:30")])
    ).toEqual({
      times: [
        { at: 1170, lateBy: 0 },
        { at: 1210, lateBy: 20 },
        { at: 1410, lateBy: 0 },
      ],
      end: 1470,
    });
  });

  it("uses offsets before lock-in until an arrive-by pins the clock", () => {
    expect(scheduleStops(null, [stop(30), stop(45), stop(60, "2T12:00"), stop(30)])).toEqual({
      times: [{ offset: 0 }, { offset: 30 }, { at: 2160, lateBy: 0 }, { at: 2220, lateBy: 0 }],
      end: 2250,
    });
    expect(scheduleStops(null, [stop(30)]).end).toBeNull();
    expect(scheduleStops("2026-10-03T19:30", []).end).toBeNull();
  });
});

describe("dayAndClock", () => {
  it("splits minutes after day 1 midnight into a day number and clock", () => {
    expect(dayAndClock(1170)).toEqual({ day: 1, clock: "19:30" });
    expect(dayAndClock(1470)).toEqual({ day: 2, clock: "00:30" });
  });
});

describe("spanDays", () => {
  it("covers the locked day through the end, not a day ending exactly at midnight", () => {
    expect(spanDays("2026-10-03", null)).toEqual(["2026-10-03"]);
    expect(spanDays("2026-10-03", 1440)).toEqual(["2026-10-03"]);
    expect(spanDays("2026-10-31", 2940)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(spanDays("2026-10-03", 0)).toEqual(["2026-10-03"]);
  });
});
