import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";

async function loadModule() {
  const prisma = {
    hangout: { findUnique: vi.fn() },
    hangoutCostShare: { deleteMany: vi.fn(), upsert: vi.fn((arg) => arg) },
    $transaction: vi.fn(),
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const { resplitCosts } = await import("@/lib/cost-shares");
  return { resplitCosts, prisma };
}

const costs = [
  {
    id: "cost1",
    amountCents: 2000,
    collectorId: "c",
    shares: [{ userId: "gone", amountCents: 1000, paidCents: 0, status: "UNPAID", method: null }],
  },
];

describe("resplitCosts", () => {
  beforeEach(() => vi.resetModules());

  it("does nothing for a missing or cancelled hangout", async () => {
    const mod = await loadModule();
    mod.prisma.hangout.findUnique.mockResolvedValueOnce(null);
    await mod.resplitCosts(HANGOUT_ID);
    mod.prisma.hangout.findUnique.mockResolvedValueOnce({ status: "CANCELLED" });
    await mod.resplitCosts(HANGOUT_ID);
    expect(mod.prisma.$transaction).not.toHaveBeenCalled();
    expect(mod.prisma.hangoutCostShare.deleteMany).not.toHaveBeenCalled();
  });

  it("clears every share while collecting", async () => {
    const mod = await loadModule();
    mod.prisma.hangout.findUnique.mockResolvedValue({ status: "COLLECTING" });
    await mod.resplitCosts(HANGOUT_ID);
    expect(mod.prisma.hangoutCostShare.deleteMany).toHaveBeenCalledWith({
      where: { cost: { hangoutId: HANGOUT_ID } },
    });
  });

  it("writes the plan for a scheduled hangout in one transaction", async () => {
    const mod = await loadModule();
    mod.prisma.hangout.findUnique.mockResolvedValue({
      status: "SCHEDULED",
      attendees: [{ userId: "c" }, { userId: "a" }],
      costs,
    });
    await mod.resplitCosts(HANGOUT_ID);
    expect(mod.prisma.hangoutCostShare.deleteMany).toHaveBeenCalledWith({
      where: { costId: "cost1", userId: { in: ["gone"] } },
    });
    expect(mod.prisma.hangoutCostShare.upsert).toHaveBeenCalledWith({
      where: { costId_userId: { costId: "cost1", userId: "a" } },
      create: expect.objectContaining({ costId: "cost1", userId: "a", amountCents: 1000 }),
      update: expect.objectContaining({ amountCents: 1000, status: "UNPAID" }),
    });
    expect(mod.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("skips the transaction when there is nothing to write", async () => {
    const mod = await loadModule();
    mod.prisma.hangout.findUnique.mockResolvedValue({
      status: "SCHEDULED",
      attendees: [],
      costs: [],
    });
    await mod.resplitCosts(HANGOUT_ID);
    expect(mod.prisma.$transaction).not.toHaveBeenCalled();
  });
});
