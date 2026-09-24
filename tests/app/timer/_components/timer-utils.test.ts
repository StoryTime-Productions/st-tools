import { describe, expect, it } from "vitest";
import {
  clampDurationInput,
  formatClock,
  getDisplayName,
  incrementStats,
  initialsFromName,
  isBreakPhase,
  mixHexColors,
  normalizeHexColor,
  phaseLabel,
  readableTextColor,
  toRgba,
} from "@/app/timer/_components/timer-utils";

describe("formatClock", () => {
  it("pads minutes and seconds", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(1500)).toBe("25:00");
  });

  it("goes past an hour without wrapping and floors fractions", () => {
    expect(formatClock(5400)).toBe("90:00");
    expect(formatClock(59.9)).toBe("00:59");
  });
});

describe("phaseLabel and isBreakPhase", () => {
  it("labels each phase", () => {
    expect(phaseLabel("work")).toBe("Focus");
    expect(phaseLabel("shortBreak")).toBe("Short break");
    expect(phaseLabel("longBreak")).toBe("Long break");
  });

  it("treats only breaks as break phases", () => {
    expect(isBreakPhase("work")).toBe(false);
    expect(isBreakPhase("shortBreak")).toBe(true);
    expect(isBreakPhase("longBreak")).toBe(true);
  });
});

describe("clampDurationInput", () => {
  it("rounds and clamps into range", () => {
    expect(clampDurationInput(24.6, 1, 90)).toBe(25);
    expect(clampDurationInput(0, 1, 90)).toBe(1);
    expect(clampDurationInput(200, 1, 90)).toBe(90);
  });

  it("falls back to the minimum for non-finite input", () => {
    expect(clampDurationInput(Number.NaN, 5, 60)).toBe(5);
    expect(clampDurationInput(Number.POSITIVE_INFINITY, 5, 60)).toBe(5);
  });
});

describe("getDisplayName and initialsFromName", () => {
  it("prefers a trimmed name and falls back to the email", () => {
    expect(getDisplayName("  Alice  ", "a@x.com")).toBe("Alice");
    expect(getDisplayName("   ", "a@x.com")).toBe("a@x.com");
    expect(getDisplayName(null, "a@x.com")).toBe("a@x.com");
  });

  it("uses the first two words' initials", () => {
    expect(initialsFromName("nirav patel kumar", "n@x.com")).toBe("NP");
    expect(initialsFromName("Alice", "a@x.com")).toBe("A");
  });

  it("uses the email when there is no name", () => {
    expect(initialsFromName(null, "bob@storytime.gg")).toBe("B");
  });

  it("returns a placeholder when nothing is usable", () => {
    expect(initialsFromName(null, "   ")).toBe("?");
  });
});

describe("normalizeHexColor", () => {
  it("lowercases valid 6-digit hex and trims whitespace", () => {
    expect(normalizeHexColor(" #1968E6 ", "#000000")).toBe("#1968e6");
  });

  it("falls back for missing or invalid values", () => {
    expect(normalizeHexColor(undefined, "#3b82f6")).toBe("#3b82f6");
    expect(normalizeHexColor("", "#3b82f6")).toBe("#3b82f6");
    expect(normalizeHexColor("#fff", "#3b82f6")).toBe("#3b82f6");
    expect(normalizeHexColor("blue", "#3b82f6")).toBe("#3b82f6");
  });
});

describe("mixHexColors and toRgba", () => {
  it("returns the endpoints at ratio 0 and 1 and the midpoint at 0.5", () => {
    expect(mixHexColors("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHexColors("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHexColors("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("clamps the ratio", () => {
    expect(mixHexColors("#3b82f6", "#f97316", -2)).toBe("#3b82f6");
    expect(mixHexColors("#3b82f6", "#f97316", 5)).toBe("#f97316");
  });

  it("treats invalid colours as black", () => {
    expect(mixHexColors("nope", "#ffffff", 0)).toBe("#000000");
  });

  it("builds rgba strings with a clamped alpha", () => {
    expect(toRgba("#3b82f6", 0.24)).toBe("rgba(59, 130, 246, 0.24)");
    expect(toRgba("#3b82f6", 2)).toBe("rgba(59, 130, 246, 1)");
    expect(toRgba("#3b82f6", -1)).toBe("rgba(59, 130, 246, 0)");
  });
});

describe("incrementStats", () => {
  const stats = {
    todayCount: 2,
    weekCount: 6,
    totalCount: 11,
    last7Days: [
      { dateKey: "2026-03-20", label: "Fri", count: 0 },
      { dateKey: "2026-03-21", label: "Sat", count: 2 },
    ],
  };

  it("bumps every total and only today's bar", () => {
    expect(incrementStats(stats)).toEqual({
      todayCount: 3,
      weekCount: 7,
      totalCount: 12,
      last7Days: [
        { dateKey: "2026-03-20", label: "Fri", count: 0 },
        { dateKey: "2026-03-21", label: "Sat", count: 3 },
      ],
    });
  });

  it("does not mutate the previous snapshot", () => {
    incrementStats(stats);

    expect(stats.todayCount).toBe(2);
    expect(stats.last7Days[1].count).toBe(2);
  });

  it("handles an empty 7-day series", () => {
    expect(incrementStats({ ...stats, last7Days: [] }).last7Days).toEqual([]);
  });
});

describe("readableTextColor", () => {
  it("picks the text colour with the higher WCAG contrast", () => {
    expect(readableTextColor("#3b82f6")).toBe("#111111");
    expect(readableTextColor("#f97316")).toBe("#111111");
    expect(readableTextColor("#1968e6")).toBe("#ffffff");
    expect(readableTextColor("#111827")).toBe("#ffffff");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#ffffff")).toBe("#111111");
  });
});
