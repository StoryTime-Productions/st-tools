import { describe, expect, it } from "vitest";
import { shareBalance, splitCost } from "@/lib/costs";

describe("splitCost", () => {
  it("splits evenly with no remainder", () => {
    expect(splitCost(3000, 3)).toEqual({ each: 1000, collector: 1000 });
  });

  it("rounds others up and the collector absorbs the difference", () => {
    const { each, collector } = splitCost(1000, 3);
    expect(each).toBe(334);
    expect(collector).toBe(332);
    expect(each * 2 + collector).toBe(1000);
  });

  it("falls back to rounding down when rounding up would overshoot", () => {
    const { each, collector } = splitCost(1, 5);
    expect(each).toBe(0);
    expect(collector).toBe(1);
    expect(each * 4 + collector).toBe(1);
  });

  it("gives a lone attendee the whole amount", () => {
    expect(splitCost(999, 1)).toEqual({ each: 999, collector: 999 });
  });
});

describe("shareBalance", () => {
  const share = (
    amountCents: number,
    paidCents: number,
    status: "UNPAID" | "SENT" | "CONFIRMED" | "REFUNDED"
  ) => ({
    amountCents,
    paidCents,
    status,
  });

  it("owes the full amount while unpaid", () => {
    expect(shareBalance(share(500, 0, "UNPAID"))).toEqual({ kind: "owes", cents: 500 });
  });

  it("is pending while sent", () => {
    expect(shareBalance(share(500, 0, "SENT"))).toEqual({ kind: "pending", cents: 500 });
  });

  it("is settled when confirmed at the same amount", () => {
    expect(shareBalance(share(500, 500, "CONFIRMED"))).toEqual({ kind: "settled", cents: 0 });
  });

  it("owes the difference after a re-split up", () => {
    expect(shareBalance(share(700, 500, "UNPAID"))).toEqual({ kind: "owes", cents: 200 });
  });

  it("is owed the difference after a re-split down, and a removed share owes a full refund", () => {
    expect(shareBalance(share(300, 500, "CONFIRMED"))).toEqual({ kind: "owed", cents: 200 });
    expect(shareBalance(share(0, 500, "CONFIRMED"))).toEqual({ kind: "owed", cents: 500 });
  });
});
