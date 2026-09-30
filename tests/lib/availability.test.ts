import { describe, expect, it } from "vitest";
import { rankRuns } from "@/lib/availability";

const window = { dates: ["2026-10-03", "2026-10-04"], startHour: 10, endHour: 11 };

describe("rankRuns", () => {
  it("merges same-people slots into runs, most free first, earliest on ties", () => {
    const responses = [
      { userId: "a", slots: ["2026-10-03T10:00", "2026-10-03T10:15", "2026-10-04T10:45"] },
      { userId: "b", slots: ["2026-10-03T10:00", "2026-10-03T10:15", "2026-10-03T10:30"] },
      { userId: "c", slots: ["2026-10-04T10:45"] },
    ];

    expect(rankRuns(window, responses)).toEqual([
      { day: "2026-10-03", start: "10:00", end: "10:30", free: ["a", "b"] },
      { day: "2026-10-04", start: "10:45", end: "11:00", free: ["a", "c"] },
      { day: "2026-10-03", start: "10:30", end: "10:45", free: ["b"] },
    ]);
    expect(rankRuns(window, responses, 1)).toHaveLength(1);
  });

  it("splits runs at gaps and day boundaries", () => {
    const responses = [
      { userId: "a", slots: ["2026-10-03T10:45", "2026-10-04T10:00", "2026-10-04T10:30"] },
    ];

    expect(rankRuns(window, responses).map((run) => `${run.day}T${run.start}-${run.end}`)).toEqual([
      "2026-10-03T10:45-11:00",
      "2026-10-04T10:00-10:15",
      "2026-10-04T10:30-10:45",
    ]);
    expect(rankRuns(window, [])).toEqual([]);
  });
});
