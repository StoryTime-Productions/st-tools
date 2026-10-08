import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const COST_ID = "88888888-8888-4888-8888-888888888888";
const COLLECTOR = "44444444-4444-4444-8444-444444444444";
const BOB = "55555555-5555-4555-8555-555555555555";
const CAT = "66666666-6666-4666-8666-666666666666";
const admin = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" };
const member = { id: COLLECTOR, role: "MEMBER" };
const values = {
  title: "Tickets",
  amountCents: 6000,
  collectorId: COLLECTOR,
  participantIds: [BOB, CAT, BOB],
  notes: " ",
};

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
    user: {
      findUnique: vi.fn().mockResolvedValue({ id: COLLECTOR }),
      count: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.length),
    },
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
    hangoutCostParticipant: {
      findMany: vi.fn().mockResolvedValue([{ userId: BOB }, { userId: CAT }]),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    hangoutCostShare: { findFirst: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
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

  it("adds an item at the end with its group and re-splits", async () => {
    const mod = await loadModule();
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCost.create).toHaveBeenCalledWith({
      data: {
        title: "Tickets",
        amountCents: 6000,
        collectorId: COLLECTOR,
        notes: null,
        hangoutId: HANGOUT_ID,
        position: 2,
        participants: { create: [{ userId: BOB }, { userId: CAT }] },
      },
    });
    expect(mod.prisma.user.count).toHaveBeenCalledWith({ where: { id: { in: [BOB, CAT] } } });
    expect(mod.resplitCosts).toHaveBeenCalledWith(HANGOUT_ID);
    expect(mod.queueUpdate).toHaveBeenCalledWith(HANGOUT_ID, "Costs", "—", "Tickets $60.00");
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);
  });

  it("allows an empty group (G10)", async () => {
    const mod = await loadModule();
    await expect(mod.addCostAction(HANGOUT_ID, { ...values, participantIds: [] })).resolves.toEqual(
      { success: true }
    );
    expect(mod.prisma.user.count).not.toHaveBeenCalled();
    expect(mod.prisma.hangoutCost.create.mock.lastCall?.[0].data.participants).toEqual({
      create: [],
    });
  });

  it("rejects non-admins, bad input, unknown hangouts, collectors and participants, cancelled hangouts", async () => {
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
    await expect(
      mod.addCostAction(HANGOUT_ID, { ...values, participantIds: ["nope"] })
    ).resolves.toEqual({ error: "Participant not found" });
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
    mod.prisma.user.count.mockResolvedValueOnce(1);
    await expect(mod.addCostAction(HANGOUT_ID, values)).resolves.toEqual({
      error: "Participant not found",
    });
    expect(mod.prisma.hangoutCost.create).not.toHaveBeenCalled();
  });

  it("updates an item and its group, then re-splits; deletes an item", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCostParticipant.findMany.mockResolvedValue([{ userId: BOB }]);

    await expect(mod.updateCostAction(COST_ID, values)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCost.update).toHaveBeenCalledWith({
      where: { id: COST_ID },
      data: { title: "Tickets", amountCents: 6000, collectorId: COLLECTOR, notes: null },
    });
    expect(mod.prisma.hangoutCostParticipant.deleteMany).toHaveBeenCalledWith({
      where: { costId: COST_ID, userId: { notIn: [BOB, CAT] } },
    });
    expect(mod.prisma.hangoutCostParticipant.createMany).toHaveBeenCalledWith({
      data: [
        { costId: COST_ID, userId: BOB },
        { costId: COST_ID, userId: CAT },
      ],
      skipDuplicates: true,
    });
    expect(mod.prisma.hangoutCostShare.findFirst).not.toHaveBeenCalled();

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

  it("won't remove a participant who has paid until they are refunded (G7)", async () => {
    const mod = await loadModule();
    mod.prisma.hangoutCostShare.findFirst.mockResolvedValueOnce({
      user: { name: null, email: "cat@x.gg" },
    });

    await expect(
      mod.updateCostAction(COST_ID, { ...values, participantIds: [BOB] })
    ).resolves.toEqual({
      error: "cat@x.gg has paid; mark them refunded before removing them",
    });
    expect(mod.prisma.hangoutCostShare.findFirst).toHaveBeenCalledWith({
      where: {
        costId: COST_ID,
        userId: { in: [CAT], not: COLLECTOR },
        OR: [{ paidCents: { gt: 0 } }, { status: { in: ["SENT", "CONFIRMED"] } }],
      },
      select: { user: { select: { name: true, email: true } } },
    });
    expect(mod.prisma.$transaction).not.toHaveBeenCalled();

    // Refunded or unpaid participants can go.
    await expect(
      mod.updateCostAction(COST_ID, { ...values, participantIds: [BOB] })
    ).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutCostParticipant.deleteMany).toHaveBeenCalledWith({
      where: { costId: COST_ID, userId: { notIn: [BOB] } },
    });
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
    mod.prisma.user.count.mockResolvedValueOnce(0);
    await expect(mod.updateCostAction(COST_ID, values)).resolves.toEqual({
      error: "Participant not found",
    });
    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.deleteCostAction(COST_ID)).resolves.toHaveProperty("error");
    expect(mod.prisma.hangoutCost.delete).not.toHaveBeenCalled();
    expect(mod.queueUpdate).toHaveBeenCalledTimes(0);
  });
});
