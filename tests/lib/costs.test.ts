import { describe, expect, it } from "vitest";
import { estimateCents, planShares, shareBalance, splitCost } from "@/lib/costs";

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

describe("planShares", () => {
  const item = { amountCents: 3000, collectorId: "c" };
  type Status = "UNPAID" | "SENT" | "CONFIRMED" | "REFUNDED";
  const row = (userId: string, amountCents: number, paidCents: number, status: Status) => ({
    userId,
    amountCents,
    paidCents,
    status,
    method: null,
  });

  it("creates unpaid shares and confirms a Going collector", () => {
    const { upsert, remove } = planShares(item, ["c", "a", "b"], []);
    expect(remove).toEqual([]);
    expect(upsert).toEqual([
      row("c", 1000, 1000, "CONFIRMED"),
      row("a", 1000, 0, "UNPAID"),
      row("b", 1000, 0, "UNPAID"),
    ]);
  });

  it("uses the rounded-up share for everyone when the collector is not Going", () => {
    const { upsert } = planShares({ amountCents: 1000, collectorId: "x" }, ["a", "b", "c"], []);
    expect(upsert.map((share) => share.amountCents)).toEqual([334, 334, 334]);
  });

  it("returns a confirmed share to Unpaid when it owes more, keeps it when owed", () => {
    const grown = planShares(item, ["c", "a"], [row("a", 1000, 1000, "CONFIRMED")]);
    expect(grown.upsert.find((share) => share.userId === "a")).toMatchObject({
      amountCents: 1500,
      paidCents: 1000,
      status: "UNPAID",
    });
    const shrunk = planShares(item, ["c", "a", "b", "d"], [row("a", 1500, 1500, "CONFIRMED")]);
    expect(shrunk.upsert.find((share) => share.userId === "a")).toMatchObject({
      amountCents: 750,
      paidCents: 1500,
      status: "CONFIRMED",
    });
  });

  it("keeps Sent and resets Refunded when the member returns", () => {
    const plan = planShares(
      item,
      ["c", "a", "b"],
      [row("a", 1500, 0, "SENT"), row("b", 0, 1000, "REFUNDED")]
    );
    expect(plan.upsert.find((share) => share.userId === "a")).toMatchObject({
      amountCents: 1000,
      status: "SENT",
    });
    expect(plan.upsert.find((share) => share.userId === "b")).toMatchObject({
      paidCents: 0,
      status: "UNPAID",
    });
  });

  it("drops a leaver with no money and keeps a refund-due row for one who paid", () => {
    const plan = planShares(
      item,
      ["c"],
      [row("u", 1000, 0, "UNPAID"), row("p", 1000, 1000, "CONFIRMED"), row("s", 1000, 0, "SENT")]
    );
    expect(plan.remove).toEqual(["u"]);
    expect(plan.upsert).toContainEqual(row("p", 0, 1000, "CONFIRMED"));
    expect(plan.upsert).toContainEqual(row("s", 0, 1000, "SENT"));
  });

  it("keeps a refund-due row for a leaver whose paid share grew back to Unpaid", () => {
    const plan = planShares(item, ["c"], [row("g", 1500, 1000, "UNPAID")]);
    expect(plan.remove).toEqual([]);
    expect(plan.upsert).toContainEqual(row("g", 0, 1000, "UNPAID"));
  });

  it("leaves an already-zeroed refund-due row alone and handles nobody Going", () => {
    const plan = planShares(item, [], [row("p", 0, 1000, "CONFIRMED")]);
    expect(plan).toEqual({ upsert: [], remove: [] });
  });
});

describe("estimateCents", () => {
  it("is the per-person share, or null when nobody is counted", () => {
    expect(estimateCents(1000, 3)).toBe(334);
    expect(estimateCents(1000, 0)).toBeNull();
  });
});
