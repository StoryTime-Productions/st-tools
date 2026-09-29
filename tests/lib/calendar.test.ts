import { describe, expect, it } from "vitest";
import {
  addDays,
  hourLabel,
  rangeLabel,
  stepAnchor,
  todayKey,
  torontoInputValue,
  torontoToUtc,
  visibleDays,
} from "@/lib/calendar";

describe("calendar helpers", () => {
  it("uses the EST date for today", () => {
    expect(todayKey(new Date("2026-09-28T03:30:00Z"))).toBe("2026-09-27");
    expect(todayKey(new Date("2026-09-28T04:30:00Z"))).toBe("2026-09-28");
  });

  it("lists whole Sunday-start weeks for a month and the month's days for agenda", () => {
    const month = visibleDays("month", "2026-09-27");
    expect(month[0]).toBe("2026-08-30");
    expect(month.at(-1)).toBe("2026-10-03");
    expect(month).toHaveLength(35);

    const agenda = visibleDays("agenda", "2026-02-10");
    expect([agenda[0], agenda.at(-1), agenda.length]).toEqual(["2026-02-01", "2026-02-28", 28]);
  });

  it("lists the week and the day", () => {
    expect(visibleDays("week", "2026-10-01")).toEqual([
      "2026-09-27",
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(visibleDays("day", "2026-10-01")).toEqual(["2026-10-01"]);
  });

  it("steps by the view's unit across month and year ends", () => {
    expect(stepAnchor("day", "2026-12-31", 1)).toBe("2027-01-01");
    expect(stepAnchor("week", "2026-09-27", -1)).toBe("2026-09-20");
    expect(stepAnchor("month", "2026-01-31", 1)).toBe("2026-02-01");
    expect(stepAnchor("agenda", "2026-01-15", -1)).toBe("2025-12-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("labels each view's range", () => {
    expect(rangeLabel("month", "2026-09-27")).toBe("September 2026");
    expect(rangeLabel("week", "2026-09-29")).toBe("Sep 27 – Oct 3, 2026");
    expect(rangeLabel("day", "2026-09-27")).toBe("Sunday, September 27, 2026");
  });

  it("converts Toronto wall-clock times to instants across daylight saving", () => {
    expect(torontoToUtc("2026-10-03", 18 * 60).toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(torontoToUtc("2026-12-03", 18 * 60 + 30).toISOString()).toBe("2026-12-03T23:30:00.000Z");
    expect(torontoToUtc("2026-11-01", 12 * 60).toISOString()).toBe("2026-11-01T17:00:00.000Z");
    expect(torontoInputValue(new Date("2026-10-03T22:00:00Z"))).toBe("2026-10-03T18:00");
    expect(torontoInputValue(new Date("2026-12-04T04:30:00Z"))).toBe("2026-12-03T23:30");
  });

  it("labels whole hours on a 12-hour clock", () => {
    expect([0, 9, 12, 13, 23, 24].map(hourLabel)).toEqual([
      "12 AM",
      "9 AM",
      "12 PM",
      "1 PM",
      "11 PM",
      "Midnight",
    ]);
  });
});
