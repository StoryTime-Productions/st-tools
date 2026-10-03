import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const COST_ID = "88888888-8888-4888-8888-888888888888";
const COLLECTOR = "44444444-4444-4444-8444-444444444444";
const admin = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" };
const member = { id: COLLECTOR, role: "MEMBER" };
const values = { title: "Tickets", amountCents: 6000, collectorId: COLLECTOR, notes: " " };

async function loadModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(admin);
  const resplitCosts = vi.fn();
  const queueUpdate = vi.fn();
  vi.doMock("@/lib/hangout-updates", async (importActual) => ({
    ...(await importActual<typeof import("@/lib/hangout-updates")>()),
    queueUpdate,
  }));
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: COLLECTOR }) },
    hangout: {
      findUnique: vi.fn().mockResolvedValue({ status: "SCHEDULED", _count: { costs: 2 } }),
    },
    hangoutCost: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn().mockResolvedValue({
        hangoutId: HANGOUT_ID,
        title: "Old",
        amountCents: 4000,
        hangout: { status: "SCHEDULED" },
      }),
    },
  };
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/cost-shares", () => ({ resplitCosts }));
  const actions = await import("@/app/actions/costs");
  return { ...actions, revalidatePath, getCurrentUser, resplitCosts, prisma, queueUpdate };
}

describe("cost actions", () => {
  beforeEach(() => vi.resetModules());

  it("adds an item at the end and re-splits", async () => {
    const mod = await loadModule();
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCost.create).toHaveBeenCalledWith({
      data: { ...values, notes: null, hangoutId: HANGOUT_ID, position: 2 },
    });
    expect(mod.resplitCosts).toHaveBeenCalledWith(HANGOUT_ID);
    expect(mod.queueUpdate).toHaveBeenCalledWith(HANGOUT_ID, "Costs", "—", "Tickets $60.00");
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);
  });

  it("rejects non-admins, bad input, unknown hangouts and collectors, cancelled hangouts", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toHaveProperty("error");
    mod.getCurrentUser.mockResolvedValue(admin);
    await expect(mod.addCostAction("nope", values)).resolves.toEqual({
      error: "Hangout not found",
    });
    await expect(mod.addCostAction(HANGOUT_ID, { ...values, title: " " })).resolves.toEqual({
      error: "Item name is required",
    });
    await expect(mod.addCostAction(HANGOUT_ID, { ...values, amountCents: 0 })).resolves.toEqual({
      error: "Amount must be above $0",
    });
    mod.prisma.hangout.findUnique.mockResolvedValueOnce(null);
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toEqual({
      error: "Hangout not found",
    });
    mod.prisma.hangout.findUnique.mockResolvedValueOnce({ status: "CANCELLED", _count: {} });
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toEqual({
      error: "This hangout is cancelled",
    });
    mod.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toEqual({
      error: "Collector not found",
    });
    expect(mod.prisma.hangoutCost.create).not.toHaveBeenCalled();
  });

  it("updates and deletes an item, then re-splits", async () => {
    const mod = await loadModule();
    await expect(mod.updateCostAction(COST_ID, values)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCost.update).toHaveBeenCalledWith({
      where: { id: COST_ID },
      data: { ...values, notes: null },
    });
    await expect(mod.deleteCostAction(COST_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCost.delete).toHaveBeenCalledWith({ where: { id: COST_ID } });
    expect(mod.resplitCosts).toHaveBeenCalledTimes(2);
    expect(mod.queueUpdate).toHaveBeenCalledWith(
      HANGOUT_ID,
      "Costs",
      "Old $40.00",
      "Tickets $60.00"
    );
    expect(mod.queueUpdate).toHaveBeenCalledWith(HANGOUT_ID, "Costs", "Old", "removed");
  });

  it("guards update and delete", async () => {
    const mod = await loadModule();
    await expect(
      mod.updateCostAction(COST_ID, { ...values, amountCents: -1 })
    ).resolves.toHaveProperty("error");
    await expect(mod.deleteCostAction("nope")).resolves.toEqual({ error: "Cost not found" });
    mod.prisma.hangoutCost.findUnique.mockResolvedValueOnce(null);
    await expect(mod.deleteCostAction(COST_ID)).resolves.toEqual({ error: "Cost not found" });
    mod.prisma.hangoutCost.findUnique.mockResolvedValueOnce({
      hangoutId: HANGOUT_ID,
      hangout: { status: "CANCELLED" },
    });
    await expect(mod.deleteCostAction(COST_ID)).resolves.toEqual({
      error: "This hangout is cancelled",
    });
    mod.prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(mod.updateCostAction(COST_ID, values)).resolves.toEqual({
      error: "Collector not found",
    });
    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.deleteCostAction(COST_ID)).resolves.toHaveProperty("error");
    expect(mod.prisma.hangoutCost.delete).not.toHaveBeenCalled();
    expect(mod.queueUpdate).toHaveBeenCalledTimes(0);
  });
});
