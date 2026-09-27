import { describe, expect, it } from "vitest";
import {
  formatQuarter,
  formatQuarterRange,
  projectInitials,
  quarterOptions,
} from "@/lib/hub-format";

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
});
