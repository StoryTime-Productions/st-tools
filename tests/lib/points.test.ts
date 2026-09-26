import { describe, expect, it } from "vitest";
import { calculateSessionPoints } from "@/lib/points";

describe("calculateSessionPoints", () => {
  it("awards one point per full 25 minutes", () => {
    expect(calculateSessionPoints(25, false)).toBe(1);
    expect(calculateSessionPoints(49, false)).toBe(1);
    expect(calculateSessionPoints(50, false)).toBe(2);
  });

  it("awards nothing for sessions under 25 minutes, even when they complete a set", () => {
    expect(calculateSessionPoints(24, false)).toBe(0);
    expect(calculateSessionPoints(1, true)).toBe(0);
  });

  it("adds the set completion bonus", () => {
    expect(calculateSessionPoints(25, true)).toBe(3);
    expect(calculateSessionPoints(50, true)).toBe(4);
  });
});
