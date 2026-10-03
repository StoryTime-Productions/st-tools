import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "11111111-1111-4111-8111-111111111111";
const KEY = { hangoutId: HANGOUT_ID, userId: "u1" };

async function load() {
  const prisma = {
    hangout: { findUnique: vi.fn().mockResolvedValue({ status: "SCHEDULED" }) },
    hangoutAttendee: { upsert: vi.fn() },
    hangoutRider: { deleteMany: vi.fn() },
    hangoutCar: { deleteMany: vi.fn() },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const hangoutEnded = vi.fn().mockResolvedValue(false);
  const recomputeRoutes = vi.fn();
  const resplitCosts = vi.fn();
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/hangouts", () => ({ hangoutEnded }));
  vi.doMock("@/lib/routes", () => ({ recomputeRoutes }));
  vi.doMock("@/lib/cost-shares", () => ({ resplitCosts }));
  const mod = await import("@/lib/attendance");
  return { ...mod, prisma, hangoutEnded, recomputeRoutes, resplitCosts };
}

describe("applyAttendance", () => {
  beforeEach(() => vi.resetModules());

  it("keeps a Going answer without touching rides or routes", async () => {
    const mod = await load();

    await expect(mod.applyAttendance(HANGOUT_ID, "u1", "GOING")).resolves.toBeNull();
    expect(mod.prisma.hangoutAttendee.upsert).toHaveBeenCalledWith({
      where: { hangoutId_userId: KEY },
      create: { ...KEY, status: "GOING" },
      update: { status: "GOING" },
    });
    expect(mod.prisma.hangoutRider.deleteMany).not.toHaveBeenCalled();
    expect(mod.recomputeRoutes).not.toHaveBeenCalled();
    expect(mod.resplitCosts).toHaveBeenCalledWith(HANGOUT_ID);
  });

  it("drops the ride and car and reroutes when leaving Going", async () => {
    const mod = await load();

    await mod.applyAttendance(HANGOUT_ID, "u1", "MAYBE");

    expect(mod.prisma.hangoutRider.deleteMany).toHaveBeenCalledWith({ where: KEY });
    expect(mod.prisma.hangoutCar.deleteMany).toHaveBeenCalledWith({
      where: { hangoutId: HANGOUT_ID, driverId: "u1" },
    });
    expect(mod.recomputeRoutes).toHaveBeenCalledWith(HANGOUT_ID);
  });

  it("refuses unscheduled and ended hangouts without writing", async () => {
    const mod = await load();

    mod.prisma.hangout.findUnique.mockResolvedValueOnce({ status: "COLLECTING" });
    await expect(mod.applyAttendance(HANGOUT_ID, "u1", "GOING")).resolves.toBe(mod.NOT_SCHEDULED);
    mod.hangoutEnded.mockResolvedValueOnce(true);
    await expect(mod.applyAttendance(HANGOUT_ID, "u1", "GOING")).resolves.toBe(mod.ENDED);
    expect(mod.prisma.hangoutAttendee.upsert).not.toHaveBeenCalled();
  });
});
