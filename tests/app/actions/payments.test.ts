import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const COST_ID = "88888888-8888-4888-8888-888888888888";
const COLLECTOR = "33333333-3333-4333-8333-333333333333";
const PAYER = "44444444-4444-4444-8444-444444444444";
const payer = { id: PAYER, role: "MEMBER" };
const collector = { id: COLLECTOR, role: "MEMBER" };

const share = (over: Record<string, unknown> = {}) => ({
  amountCents: 1000,
  paidCents: 0,
  status: "UNPAID",
  cost: { hangoutId: HANGOUT_ID, collectorId: COLLECTOR, hangout: { status: "SCHEDULED" } },
  ...over,
});

async function loadModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(payer);
  const prisma = {
    hangoutCostShare: {
      findUnique: vi.fn().mockResolvedValue(share()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const actions = await import("@/app/actions/payments");
  return { ...actions, revalidatePath, getCurrentUser, prisma };
}

describe("payment actions", () => {
  beforeEach(() => vi.resetModules());

  it("marks own share Sent with a method, then undoes it", async () => {
    const mod = await loadModule();
    await expect(mod.markSentAction(COST_ID, "E_TRANSFER")).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "UNPAID" },
      data: { status: "SENT", method: "E_TRANSFER" },
    });
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);

    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(share({ status: "SENT" }));
    await expect(mod.undoSentAction(COST_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenLastCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "SENT" },
      data: { status: "UNPAID", method: null },
    });
  });

  it("refuses Sent / undo when signed out, bad method, no share, nothing owed, or a leaver", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(null);
    await expect(mod.markSentAction(COST_ID, "CASH")).resolves.toEqual({ error: "Unauthorized" });
    await expect(mod.undoSentAction(COST_ID)).resolves.toEqual({ error: "Unauthorized" });
    mod.getCurrentUser.mockResolvedValue(payer);
    await expect(mod.markSentAction(COST_ID, "BITCOIN" as unknown as "CASH")).resolves.toEqual({
      error: "Pick a method",
    });
    await expect(mod.markSentAction("nope", "CASH")).resolves.toEqual({
      error: "Share not found",
    });
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValueOnce(null);
    await expect(mod.markSentAction(COST_ID, "CASH")).resolves.toEqual({
      error: "Share not found",
    });
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValueOnce(
      share({
        cost: { hangoutId: HANGOUT_ID, collectorId: COLLECTOR, hangout: { status: "COLLECTING" } },
      })
    );
    await expect(mod.markSentAction(COST_ID, "CASH")).resolves.toEqual({
      error: "Share not found",
    });
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValueOnce(share({ paidCents: 1000 }));
    await expect(mod.markSentAction(COST_ID, "CASH")).resolves.toEqual({
      error: "Nothing to pay",
    });
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValueOnce(
      share({ amountCents: 0, status: "SENT", paidCents: 500 })
    );
    await expect(mod.undoSentAction(COST_ID)).resolves.toEqual({
      error: "Ask the collector to settle this one",
    });
  });

  it("reports a stale share when the guarded update matches nothing", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCostShare.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(mod.markSentAction(COST_ID, "CASH")).resolves.toEqual({
      error: "That share changed; refresh and try again",
    });
    expect(mod.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets only the collector confirm, revert and refund", async () => {
    const mod = await loadModule();
    await expect(mod.confirmPaymentAction(COST_ID, PAYER)).resolves.toEqual({
      error: "Only the collector can do this",
    });
    await expect(mod.revertConfirmationAction(COST_ID, PAYER)).resolves.toEqual({
      error: "Only the collector can do this",
    });
    await expect(mod.markRefundedAction(COST_ID, PAYER)).resolves.toEqual({
      error: "Only the collector can do this",
    });
    mod.getCurrentUser.mockResolvedValue(null);
    await expect(mod.confirmPaymentAction(COST_ID, PAYER)).resolves.toEqual({
      error: "Unauthorized",
    });
    mod.getCurrentUser.mockResolvedValue(collector);
    await expect(mod.confirmPaymentAction("nope", PAYER)).resolves.toEqual({
      error: "Share not found",
    });
    expect(mod.prisma.hangoutCostShare.updateMany).not.toHaveBeenCalled();
  });

  it("confirms to at least the amount owed", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(collector);
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(share({ status: "SENT" }));
    await expect(mod.confirmPaymentAction(COST_ID, PAYER)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenLastCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "SENT" },
      data: { status: "CONFIRMED", paidCents: 1000 },
    });

    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(
      share({ status: "SENT", amountCents: 0, paidCents: 700 })
    );
    await mod.confirmPaymentAction(COST_ID, PAYER);
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenLastCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "SENT" },
      data: { status: "CONFIRMED", paidCents: 700 },
    });
  });

  it("reverts a confirmation but never the collector's own share", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(collector);
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(
      share({ status: "CONFIRMED", paidCents: 1000 })
    );
    await expect(mod.revertConfirmationAction(COST_ID, PAYER)).resolves.toEqual({
      success: true,
    });
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenLastCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "CONFIRMED" },
      data: { status: "SENT", paidCents: 0 },
    });
    await expect(mod.revertConfirmationAction(COST_ID, COLLECTOR)).resolves.toEqual({
      error: "Your own share is always settled",
    });
  });

  it("refunds a leaver's row and squares up a member who stayed", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(collector);
    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(
      share({ status: "CONFIRMED", amountCents: 0, paidCents: 1000 })
    );
    await expect(mod.markRefundedAction(COST_ID, PAYER)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenLastCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "CONFIRMED" },
      data: { status: "REFUNDED", paidCents: 0 },
    });

    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(
      share({ status: "CONFIRMED", amountCents: 500, paidCents: 1000 })
    );
    await mod.markRefundedAction(COST_ID, PAYER);
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenLastCalledWith({
      where: { costId: COST_ID, userId: PAYER, status: "CONFIRMED" },
      data: { paidCents: 500 },
    });

    mod.prisma.hangoutCostShare.findUnique.mockResolvedValue(
      share({ status: "CONFIRMED", paidCents: 1000 })
    );
    await expect(mod.markRefundedAction(COST_ID, PAYER)).resolves.toEqual({
      error: "No refund is due",
    });
  });
});
