import { describe, expect, it } from "vitest";
import { getSheetUrl, parseSheet, pickCurrentWeek, type WeekRow } from "@/lib/playlist-sheet";

const csv = [
  "Intro,,,",
  ",Ann,Bo,",
  'Week 1 (DONE),"Song, One - X",Two - Y,',
  "Week 2 (56 h left),Three - Z,,",
  "Notes,,,",
  "Week 3 (open)",
].join("\n");

describe("parseSheet", () => {
  it("reads people, weeks, statuses and non-blank entries", () => {
    const { people, weeks } = parseSheet(csv);
    expect(people).toEqual(["Ann", "Bo"]);
    expect(weeks.map((w) => [w.weekNumber, w.status])).toEqual([
      [1, "DONE"],
      [2, "56 h left"],
      [3, "open"],
    ]);
    expect(weeks[0]?.entries).toEqual({ Ann: "Song, One - X", Bo: "Two - Y" });
    expect(weeks[1]?.entries).toEqual({ Ann: "Three - Z" });
    expect(weeks[2]?.entries).toEqual({});
  });

  it("throws when no week rows exist", () => {
    expect(() => parseSheet("a,b\nc,d")).toThrow();
    expect(() => parseSheet("Week 1 (DONE),x")).toThrow();
  });
});

describe("pickCurrentWeek", () => {
  const week = (weekNumber: number, status: string): WeekRow => ({
    weekNumber,
    status,
    entries: {},
  });

  it("returns the first non-DONE week", () => {
    expect(pickCurrentWeek([week(1, "done"), week(2, "5 h"), week(3, "x")])?.weekNumber).toBe(2);
  });

  it("returns the latest week when all are DONE", () => {
    expect(pickCurrentWeek([week(1, "DONE"), week(2, "DONE")])?.weekNumber).toBe(2);
  });

  it("returns undefined for no weeks", () => {
    expect(pickCurrentWeek([])).toBeUndefined();
  });
});

describe("getSheetUrl", () => {
  it("builds the edit url", () => {
    expect(getSheetUrl("abc")).toBe("https://docs.google.com/spreadsheets/d/abc/edit");
  });
});
