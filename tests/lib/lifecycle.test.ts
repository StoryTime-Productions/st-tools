import { describe, expect, it } from "vitest";
import { hangoutEnd, hangoutEnded, hangoutPhase, unpaidCount } from "@/lib/lifecycle";

const stop = { durationMinutes: 120, arriveBy: null };
const share = (status: "UNPAID" | "SENT" | "CONFIRMED" | "REFUNDED", amount = 1000, paid = 0) => ({
  status,
  amountCents: amount,
  paidCents: paid,
});

describe("hangoutEnd", () => {
  it("is the last stop's end", () => {
    expect(hangoutEnd("2026-10-03T19:30", [stop]).toISOString()).toBe("2026-10-04T01:30:00.000Z");
  });

  it("runs into the next day for a late finish", () => {
    expect(hangoutEnd("2026-10-03T23:00", [stop]).toISOString()).toBe("2026-10-04T05:00:00.000Z");
  });

  it("is midnight ending the locked day without stops", () => {
    expect(hangoutEnd("2026-10-03T19:30", []).toISOString()).toBe("2026-10-04T04:00:00.000Z");
  });
});

describe("unpaidCount", () => {
  it("counts Unpaid, Sent and refund-due shares only", () => {
    expect(
      unpaidCount([
        share("UNPAID"),
        share("SENT", 1000, 1000),
        share("CONFIRMED", 1000, 1000),
        share("CONFIRMED", 0, 1000),
        share("REFUNDED", 0, 0),
      ])
    ).toBe(3);
  });
});

describe("hangoutPhase", () => {
  const scheduled = { status: "SCHEDULED" as const, startSlot: "2026-10-03T19:30" };
  const before = new Date("2026-10-04T01:29:00Z");
  const after = new Date("2026-10-04T01:30:00Z");

  it("passes the stored status through unless Scheduled and locked", () => {
    expect(hangoutPhase({ status: "COLLECTING", startSlot: null }, [], 0, after)).toBe(
      "COLLECTING"
    );
    expect(
      hangoutPhase({ status: "CANCELLED", startSlot: "2026-10-03T19:30" }, [stop], 2, after)
    ).toBe("CANCELLED");
    expect(hangoutPhase({ status: "SCHEDULED", startSlot: null }, [], 0, after)).toBe("SCHEDULED");
  });

  it("stays Scheduled until the end time", () => {
    expect(hangoutPhase(scheduled, [stop], 3, before)).toBe("SCHEDULED");
  });

  it("is Settling up with unpaid shares, else Done", () => {
    expect(hangoutPhase(scheduled, [stop], 1, after)).toBe("SETTLING_UP");
    expect(hangoutPhase(scheduled, [stop], 0, after)).toBe("DONE");
  });
});

describe("hangoutEnded", () => {
  const scheduled = { status: "SCHEDULED" as const, startSlot: "2026-10-03T19:30" };

  it("is true once the last stop has finished", () => {
    expect(hangoutEnded(scheduled, [stop], new Date("2026-10-04T01:31:00Z"))).toBe(true);
  });

  it("is false before it finishes", () => {
    expect(hangoutEnded(scheduled, [stop], new Date("2026-10-04T01:29:00Z"))).toBe(false);
  });

  it("is false for a hangout that was never scheduled or has no start", () => {
    const late = new Date("2030-01-01T00:00:00Z");
    expect(hangoutEnded({ status: "COLLECTING", startSlot: null }, [], late)).toBe(false);
    expect(hangoutEnded({ status: "CANCELLED", startSlot: "2026-10-03T19:30" }, [], late)).toBe(
      false
    );
    expect(hangoutEnded({ status: "SCHEDULED", startSlot: null }, [], late)).toBe(false);
  });
});
