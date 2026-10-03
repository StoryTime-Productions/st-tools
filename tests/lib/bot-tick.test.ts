import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const NOW = new Date("2026-10-10T12:00:00Z");
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

function duplicate() {
  return new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });
}

async function load() {
  const claimed = new Set<string>();
  const prisma = {
    hangout: { findMany: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([{ name: "Dana", email: "d@x.io" }]) },
    hangoutNotification: {
      create: vi.fn(async ({ data }: { data: { kind: string; key: string } }) => {
        const key = `${data.kind}:${data.key}`;
        if (claimed.has(key)) throw duplicate();
        claimed.add(key);
      }),
      deleteMany: vi.fn(async ({ where }: { where: { kind: string; key: string } }) => {
        claimed.delete(`${where.kind}:${where.key}`);
      }),
    },
    hangoutPendingUpdate: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    hangoutCostShare: { findMany: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const postToChannel = vi.fn().mockResolvedValue("m-1");
  const sendDiscordDm = vi.fn().mockResolvedValue(true);
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/discord", () => ({ postToChannel, sendDiscordDm }));
  const mod = await import("@/lib/bot-tick");
  return { ...mod, prisma, postToChannel, sendDiscordDm, claimed };
}

const ORIGIN = "https://tools.test";

describe("sendNudges", () => {
  beforeEach(() => vi.resetModules());

  function collecting(mod: Awaited<ReturnType<typeof load>>, deadline: Date) {
    mod.prisma.hangout.findMany.mockResolvedValue([
      { id: "h1", title: "Karaoke", discordThreadId: "t1", availabilityDeadline: deadline },
    ]);
  }

  it("posts the 48h nudge to the thread naming who is waiting, once", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(40));

    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(1);
    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(0);

    expect(mod.postToChannel).toHaveBeenCalledTimes(1);
    const [thread, message] = mod.postToChannel.mock.calls[0];
    expect(thread).toBe("t1");
    expect(message.embeds[0].fields[0].value).toBe("Dana");
    expect(message.components[0].components[0].url).toBe(`${ORIGIN}/hub/hangouts/h1#availability`);
  });

  it("sends the 6h nudge after the 48h one but not twice", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(40));
    await mod.sendNudges(ORIGIN, NOW);
    collecting(mod, hoursFromNow(5));

    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(1);
    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(0);
    expect(mod.postToChannel).toHaveBeenCalledTimes(2);
  });

  it("sends one nudge, not two, when the deadline is already inside 6h", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(2));

    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(1);
    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(0);
    expect([...mod.claimed].sort()).toEqual(["nudge:48h", "nudge:6h"]);
  });

  it("does nothing outside the 48h window or when everyone has answered", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(49));
    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(0);

    collecting(mod, hoursFromNow(10));
    mod.prisma.user.findMany.mockResolvedValue([]);
    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(0);
    expect(mod.postToChannel).not.toHaveBeenCalled();
    expect(mod.claimed.size).toBe(0);
  });

  it("releases the claim when the post fails so the next tick retries", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(40));
    mod.postToChannel.mockResolvedValueOnce(null);

    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(0);
    expect(mod.claimed.size).toBe(0);
    expect(await mod.sendNudges(ORIGIN, NOW)).toBe(1);
  });

  it("falls back to the email name and caps the list through the builder", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(40));
    mod.prisma.user.findMany.mockResolvedValue([{ name: null, email: "sam@x.io" }]);

    await mod.sendNudges(ORIGIN, NOW);

    expect(mod.postToChannel.mock.calls[0][1].embeds[0].fields[0].value).toBe("sam");
  });

  it("rethrows unexpected database errors", async () => {
    const mod = await load();
    collecting(mod, hoursFromNow(40));
    mod.prisma.hangoutNotification.create.mockRejectedValueOnce(new Error("db down"));

    await expect(mod.sendNudges(ORIGIN, NOW)).rejects.toThrow("db down");
  });
});

describe("flushUpdates", () => {
  beforeEach(() => vi.resetModules());

  const row = (id: string, area: string, before: string, after: string) => ({
    id,
    hangoutId: "h1",
    area,
    before,
    after,
    createdAt: new Date("2026-10-10T11:00:00Z"),
  });

  async function due(rows = [row("1", "Itinerary", "Bar", "Bowling")]) {
    const mod = await load();
    mod.prisma.hangoutPendingUpdate.findMany
      .mockResolvedValueOnce([{ hangoutId: "h1" }])
      .mockResolvedValueOnce(rows);
    mod.prisma.hangoutPendingUpdate.deleteMany.mockResolvedValue({ count: rows.length });
    mod.prisma.hangout.findUnique.mockResolvedValue({
      title: "Karaoke",
      status: "SCHEDULED",
      discordThreadId: "t1",
    });
    return mod;
  }

  it("collapses many edits into one embed with one field per area", async () => {
    const mod = await due([
      row("1", "Itinerary", "Bar", "Bowling"),
      row("2", "Costs", "$10", "$12"),
      row("3", "Itinerary", "7 PM", "8 PM"),
    ]);

    expect(await mod.flushUpdates(ORIGIN, NOW)).toBe(1);

    expect(mod.postToChannel).toHaveBeenCalledTimes(1);
    const embed = mod.postToChannel.mock.calls[0][1].embeds[0];
    expect(embed.fields).toEqual([
      { name: "Itinerary", value: "Bar → Bowling\n7 PM → 8 PM" },
      { name: "Costs", value: "$10 → $12" },
    ]);
  });

  it("only picks up updates at least five minutes old", async () => {
    const mod = await due();

    await mod.flushUpdates(ORIGIN, NOW);

    const where = mod.prisma.hangoutPendingUpdate.findMany.mock.calls[0][0].where;
    expect(where.createdAt.lte).toEqual(new Date("2026-10-10T11:55:00Z"));
  });

  it("posts nothing when another tick already claimed the rows", async () => {
    const mod = await due();
    mod.prisma.hangoutPendingUpdate.deleteMany.mockResolvedValue({ count: 0 });

    expect(await mod.flushUpdates(ORIGIN, NOW)).toBe(0);
    expect(mod.postToChannel).not.toHaveBeenCalled();
  });

  it("restores the rows when the post fails", async () => {
    const mod = await due();
    mod.postToChannel.mockResolvedValueOnce(null);

    expect(await mod.flushUpdates(ORIGIN, NOW)).toBe(0);
    expect(mod.prisma.hangoutPendingUpdate.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it("drops updates for hangouts with no thread or already cancelled", async () => {
    const noThread = await due();
    noThread.prisma.hangout.findUnique.mockResolvedValue({
      title: "K",
      status: "SCHEDULED",
      discordThreadId: null,
    });
    expect(await noThread.flushUpdates(ORIGIN, NOW)).toBe(0);
    expect(noThread.postToChannel).not.toHaveBeenCalled();

    vi.resetModules();
    const cancelled = await due();
    cancelled.prisma.hangout.findUnique.mockResolvedValue({
      title: "K",
      status: "CANCELLED",
      discordThreadId: "t1",
    });
    expect(await cancelled.flushUpdates(ORIGIN, NOW)).toBe(0);
    expect(cancelled.postToChannel).not.toHaveBeenCalled();
    expect(cancelled.prisma.hangoutPendingUpdate.createMany).not.toHaveBeenCalled();
  });

  it("drops updates for a hangout that no longer exists", async () => {
    const mod = await due();
    mod.prisma.hangout.findUnique.mockResolvedValue(null);

    expect(await mod.flushUpdates(ORIGIN, NOW)).toBe(0);
  });
});

describe("sendPaymentReminders", () => {
  beforeEach(() => vi.resetModules());

  const share = (over: Record<string, unknown> = {}) => ({
    costId: "c1",
    userId: "u1",
    amountCents: 1250,
    status: "UNPAID",
    remindersSent: 0,
    user: { discordId: "d-1" },
    cost: {
      title: "Pizza",
      collectorId: "u2",
      collector: { name: "Alice", email: "a@x.io" },
      hangout: {
        id: "h1",
        title: "Karaoke",
        startSlot: "2026-10-09T19:00",
        stops: [{ durationMinutes: 60, arriveBy: null }],
      },
    },
    ...over,
  });

  it("DMs an Unpaid share after the hangout ended and counts the attempt", async () => {
    const mod = await load();
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([share()]);

    expect(await mod.sendPaymentReminders(ORIGIN, NOW)).toBe(1);

    const update = mod.prisma.hangoutCostShare.updateMany.mock.calls[0][0];
    expect(update.where).toMatchObject({ costId: "c1", userId: "u1", remindersSent: 0 });
    expect(update.data).toEqual({ remindersSent: { increment: 1 }, lastReminderAt: NOW });
    const [discordId, message] = mod.sendDiscordDm.mock.calls[0];
    expect(discordId).toBe("d-1");
    expect(message.embeds[0].fields).toContainEqual({
      name: "Status",
      value: "Unpaid",
      inline: true,
    });
    expect(message.components[0].components[0].url).toBe(`${ORIGIN}/hub/hangouts/h1#costs`);
  });

  it("describes a Sent share as waiting for confirmation", async () => {
    const mod = await load();
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([share({ status: "SENT" })]);

    await mod.sendPaymentReminders(ORIGIN, NOW);

    expect(mod.sendDiscordDm.mock.calls[0][1].embeds[0].fields[3].value).toBe(
      "Sent, waiting for confirmation"
    );
  });

  it("queries only unconfirmed shares under the cap, spaced three days apart", async () => {
    const mod = await load();
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([]);

    await mod.sendPaymentReminders(ORIGIN, NOW);

    const where = mod.prisma.hangoutCostShare.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["UNPAID", "SENT"] });
    expect(where.remindersSent).toEqual({ lt: 3 });
    expect(where.OR).toEqual([
      { lastReminderAt: null },
      { lastReminderAt: { lte: new Date("2026-10-07T12:00:00Z") } },
    ]);
  });

  it("skips the collector's own share and hangouts that have not ended", async () => {
    const mod = await load();
    const own = share({ userId: "u2" });
    const early = share();
    early.cost.hangout.startSlot = "2026-10-10T19:00";
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([own, early]);

    expect(await mod.sendPaymentReminders(ORIGIN, NOW)).toBe(0);
    expect(mod.prisma.hangoutCostShare.updateMany).not.toHaveBeenCalled();
    expect(mod.sendDiscordDm).not.toHaveBeenCalled();
  });

  it("sends nothing when another tick already counted the reminder", async () => {
    const mod = await load();
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([share()]);
    mod.prisma.hangoutCostShare.updateMany.mockResolvedValue({ count: 0 });

    expect(await mod.sendPaymentReminders(ORIGIN, NOW)).toBe(0);
    expect(mod.sendDiscordDm).not.toHaveBeenCalled();
  });

  it("counts the attempt but reports no send when the DM is refused", async () => {
    const mod = await load();
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([share({ remindersSent: 2 })]);
    mod.sendDiscordDm.mockResolvedValue(false);

    expect(await mod.sendPaymentReminders(ORIGIN, NOW)).toBe(0);
    expect(mod.prisma.hangoutCostShare.updateMany).toHaveBeenCalledTimes(1);
  });

  it("names the collector by email when they have no name", async () => {
    const mod = await load();
    const unnamed = share();
    unnamed.cost.collector = { name: null as unknown as string, email: "zed@x.io" };
    mod.prisma.hangoutCostShare.findMany.mockResolvedValue([unnamed]);

    await mod.sendPaymentReminders(ORIGIN, NOW);

    expect(mod.sendDiscordDm.mock.calls[0][1].embeds[0].fields[2].value).toBe("zed");
  });
});
