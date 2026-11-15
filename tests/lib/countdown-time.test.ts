import { describe, expect, it } from "vitest";
import { formatCountdownDate, isoToTorontoLocal, torontoLocalToIso } from "@/lib/countdown-time";

describe("Toronto countdown time", () => {
  it("reads winter wall time as UTC-5 and summer wall time as UTC-4", () => {
    expect(torontoLocalToIso("2026-11-14T15:00")).toBe("2026-11-14T20:00:00.000Z");
    expect(torontoLocalToIso("2026-07-01T15:00")).toBe("2026-07-01T19:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    expect(torontoLocalToIso("2026-11-01T00:30")).toBe("2026-11-01T04:30:00.000Z");
    expect(torontoLocalToIso("2026-11-01T03:00")).toBe("2026-11-01T08:00:00.000Z");
    expect(torontoLocalToIso("2026-03-08T12:00")).toBe("2026-03-08T16:00:00.000Z");
  });

  it("round-trips an instant through the input value", () => {
    for (const iso of ["2026-11-14T20:00:00.000Z", "2026-07-01T19:00:00.000Z"]) {
      expect(torontoLocalToIso(isoToTorontoLocal(iso))).toBe(iso);
    }
    expect(isoToTorontoLocal("2026-11-14T20:00:00.000Z")).toBe("2026-11-14T15:00");
    expect(isoToTorontoLocal("2026-11-15T04:30:00.000Z")).toBe("2026-11-14T23:30");
  });

  it("rejects malformed input", () => {
    expect(torontoLocalToIso("")).toBeNull();
    expect(torontoLocalToIso("2026-11-14")).toBeNull();
  });

  it("formats in Toronto time whatever the machine zone is", () => {
    expect(formatCountdownDate(new Date("2026-11-14T20:00:00.000Z"))).toBe("Sat, Nov 14, 3:00 PM");
  });
});
