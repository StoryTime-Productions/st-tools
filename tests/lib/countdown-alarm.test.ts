import { describe, expect, it } from "vitest";
import {
  countdownTabTitle,
  dueAlarms,
  nextTickMs,
  shortRemaining,
  shouldRing,
  type AlarmCountdown,
} from "@/lib/countdown-alarm";

const NOW = new Date("2026-11-14T12:00:00.000Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const make = (id: string, ms: number, dismissed = false): AlarmCountdown => ({
  id,
  title: id,
  targetAt: at(ms),
  dismissed,
});
const MIN = 60_000;
const HOUR = 60 * MIN;

describe("dueAlarms", () => {
  it("lists fired, undismissed countdowns oldest first", () => {
    const list = [
      make("late", -MIN),
      make("future", MIN),
      make("old", -HOUR),
      make("done", -HOUR, true),
    ];
    expect(dueAlarms(list, NOW).map((c) => c.id)).toEqual(["old", "late"]);
  });

  it("counts a target exactly now as fired", () => {
    expect(dueAlarms([make("now", 0)], NOW)).toHaveLength(1);
  });
});

describe("shouldRing", () => {
  it("rings only when the target is not before the moment the tab opened", () => {
    expect(shouldRing({ targetAt: at(-1) }, NOW)).toBe(false);
    expect(shouldRing({ targetAt: at(0) }, NOW)).toBe(true);
    expect(shouldRing({ targetAt: at(5 * MIN) }, NOW)).toBe(true);
  });
});

describe("shortRemaining", () => {
  it("formats hours, minutes and under a minute", () => {
    expect(shortRemaining(at(2 * HOUR + 5 * MIN + 10_000), NOW)).toBe("2h 05m");
    expect(shortRemaining(at(HOUR), NOW)).toBe("1h 00m");
    expect(shortRemaining(at(12 * MIN + 1000), NOW)).toBe("12m");
    expect(shortRemaining(at(30_000), NOW)).toBe("<1m");
  });
});

describe("countdownTabTitle", () => {
  it("shows Now for the oldest unacknowledged alarm before anything upcoming", () => {
    const list = [make("soon", MIN), make("b", -MIN), make("a", -HOUR)];
    expect(countdownTabTitle(list, NOW)).toBe("Now · a");
  });

  it("shows the soonest countdown within 24 hours", () => {
    const list = [make("later", 5 * HOUR), make("soon", 2 * HOUR + 5 * MIN + 1000)];
    expect(countdownTabTitle(list, NOW)).toBe("2h 05m · soon");
  });

  it("is null when nothing is near or every alarm is dismissed", () => {
    expect(countdownTabTitle([make("far", 25 * HOUR), make("done", -MIN, true)], NOW)).toBeNull();
    expect(countdownTabTitle([], NOW)).toBeNull();
  });
});

describe("nextTickMs", () => {
  it("waits for the next minute boundary when targets are far", () => {
    const now = new Date("2026-11-14T12:00:20.000Z");
    expect(nextTickMs([make("far", 3 * HOUR)], now)).toBe(40_050);
    expect(nextTickMs([], now)).toBe(40_050);
  });

  it("wakes just after a target that is closer than the next minute", () => {
    const now = new Date("2026-11-14T12:00:00.000Z");
    expect(nextTickMs([make("t", 10_000)], now)).toBe(10_050);
  });

  it("never spins faster than 250 ms and ignores fired countdowns", () => {
    const now = new Date("2026-11-14T12:00:59.900Z");
    expect(nextTickMs([make("t", 100), make("gone", -MIN)], now)).toBeGreaterThanOrEqual(250);
  });
});
