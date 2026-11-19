import { describe, expect, it } from "vitest";
import { lineName, shortAgency } from "@/lib/transit-names";

describe("shortAgency", () => {
  it("shortens the STM in either accent spelling and leaves others alone", () => {
    expect(shortAgency("Société de transport de Montréal")).toBe("STM");
    expect(shortAgency("Societe de transport de Montreal")).toBe("STM");
    expect(shortAgency("exo")).toBe("exo");
    expect(shortAgency(undefined)).toBeUndefined();
  });
});

describe("lineName", () => {
  it("joins the short agency and line, falling back to the mode", () => {
    expect(lineName({ mode: "BUS", agency: "Société de transport de Montréal", line: "80" })).toBe(
      "STM 80"
    );
    expect(lineName({ mode: "RAIL", agency: "exo" })).toBe("exo");
    expect(lineName({ mode: "RAIL" })).toBe("rail");
  });
});
