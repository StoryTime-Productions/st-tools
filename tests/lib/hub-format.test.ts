import { describe, expect, it } from "vitest";
import {
  formatQuarter,
  formatQuarterRange,
  groupByInitiative,
  groupByQuarter,
  projectInitials,
  quarterOptions,
  quartersBetween,
  sortBySoonestEnd,
} from "@/lib/hub-format";

function project(
  title: string,
  startQuarter: string | null,
  endQuarter: string | null,
  initiativeName: string | null = null
) {
  return { title, startQuarter, endQuarter, initiativeName };
}

describe("hub format helpers", () => {
  it("formats quarters and ranges", () => {
    expect(formatQuarter("2026-Q3")).toBe("Q3 2026");
    expect(formatQuarterRange(null, null)).toBeNull();
    expect(formatQuarterRange("2026-Q3", null)).toBe("Q3 2026");
    expect(formatQuarterRange("2026-Q3", "2026-Q3")).toBe("Q3 2026");
    expect(formatQuarterRange("2026-Q3", "2027-Q1")).toBe("Q3 2026 – Q1 2027");
  });

  it("lists quarters from last year to two years ahead", () => {
    const options = quarterOptions(new Date("2026-09-27T00:00:00Z"));
    expect(options).toHaveLength(16);
    expect(options[0]).toBe("2025-Q1");
    expect(options.at(-1)).toBe("2028-Q4");
  });

  it("builds initials from the first two words", () => {
    expect(projectInitials("St-tools")).toBe("S");
    expect(projectInitials("  canadian winters machinima ")).toBe("CW");
    expect(projectInitials("")).toBe("");
  });

  it("lists every quarter in a range, across years", () => {
    expect(quartersBetween("2026-Q3", "2027-Q1")).toEqual(["2026-Q3", "2026-Q4", "2027-Q1"]);
    expect(quartersBetween("2026-Q2", "2026-Q2")).toEqual(["2026-Q2"]);
  });

  it("sorts by soonest end quarter with undated projects last", () => {
    const sorted = sortBySoonestEnd([
      project("Undated", null, null),
      project("Late", "2026-Q1", "2027-Q1"),
      project("Beta", "2026-Q3", "2026-Q3"),
      project("Alpha", "2026-Q2", "2026-Q3"),
    ]);
    expect(sorted.map((p) => p.title)).toEqual(["Alpha", "Beta", "Late", "Undated"]);
  });

  it("groups by every quarter spanned, then undated", () => {
    const groups = groupByQuarter([
      project("Span", "2026-Q3", "2026-Q4"),
      project("One", "2026-Q4", null),
      project("None", null, null),
    ]);
    expect(groups.map((g) => [g.label, g.projects.map((p) => p.title)])).toEqual([
      ["Q3 2026", ["Span"]],
      ["Q4 2026", ["Span", "One"]],
      ["No quarter", ["None"]],
    ]);
    expect(groupByQuarter([project("Dated", "2026-Q1", "2026-Q1")]).map((g) => g.label)).toEqual([
      "Q1 2026",
    ]);
  });

  it("groups by initiative alphabetically with no initiative last", () => {
    const groups = groupByInitiative([
      project("A", null, null),
      project("B", null, null, "YouTube"),
      project("C", null, null, "Game Dev"),
      project("D", null, null, "YouTube"),
    ]);
    expect(groups.map((g) => [g.label, g.projects.map((p) => p.title)])).toEqual([
      ["Game Dev", ["C"]],
      ["YouTube", ["B", "D"]],
      ["No initiative", ["A"]],
    ]);
  });
});
