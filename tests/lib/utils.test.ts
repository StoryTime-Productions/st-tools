import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    expect(cn("px-2", "font-semibold", "px-4")).toBe("font-semibold px-4");
  });

  it("ignores falsy values", () => {
    expect(cn("block", false && "hidden", null, undefined, "text-sm")).toBe("block text-sm");
  });
});
