import { describe, expect, it } from "vitest";
import { rankRuns } from "@/lib/availability";

const window = { dates: ["2026-10-03", "2026-10-04"], startHour: 10, endHour: 12 };

describe("rankRuns", () => {
  it("merges same-people slots into runs, most free first, earliest on ties", () => {
    const responses = [
      { userId: "a", slots: ["2026-10-03T10:00", "2026-10-03T10:30", "2026-10-04T11:30"] },
      { userId: "b", slots: ["2026-10-03T10:00", "2026-10-03T10:30", "2026-10-03T11:00"] },
      { userId: "c", slots: ["2026-10-04T11:30"] },
    ];

    expect(rankRuns(window, responses)).toEqual([
      { day: "2026-10-03", start: "10:00", end: "11:00", free: ["a", "b"] },
      { day: "2026-10-04", start: "11:30", end: "12:00", free: ["a", "c"] },
      { day: "2026-10-03", start: "11:00", end: "11:30", free: ["b"] },
    ]);
    expect(rankRuns(window, responses, 1)).toHaveLength(1);
  });

  it("splits runs at gaps and day boundaries", () => {
    const responses = [
      { userId: "a", slots: ["2026-10-03T11:30", "2026-10-04T10:00", "2026-10-04T11:00"] },
    ];

    expect(rankRuns(window, responses).map((run) => `${run.day}T${run.start}-${run.end}`)).toEqual([
      "2026-10-03T11:30-12:00",
      "2026-10-04T10:00-10:30",
      "2026-10-04T11:00-11:30",
    ]);
    expect(rankRuns(window, [])).toEqual([]);
  });
});
