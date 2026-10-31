import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  const prisma = {
    discordVoiceSession: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    discordMessageDay: { upsert: vi.fn((args: unknown) => args) },
    discordWordleStreak: { upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const mod = await import("@/lib/discord-ingest");
  return { ...mod, prisma };
}

const NOW = new Date("2026-10-30T20:00:00Z");
const BEFORE = new Date("2026-10-30T19:00:00Z");

describe("applyVoiceEvent", () => {
  beforeEach(() => vi.resetModules());

  it("closes the open session on leave, at the event time when given", async () => {
    const { applyVoiceEvent, prisma } = await load();
    prisma.discordVoiceSession.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await applyVoiceEvent({ type: "leave", discordId: "1", at: BEFORE }, NOW);

    expect(result).toEqual({ closed: 1, opened: 0 });
    expect(prisma.discordVoiceSession.updateMany).toHaveBeenCalledWith({
      where: { discordId: "1", leftAt: null },
      data: { leftAt: BEFORE },
    });
  });

  it("ends any open session before opening one on join, so a move splits the session", async () => {
    const { applyVoiceEvent, prisma } = await load();
    prisma.discordVoiceSession.updateMany.mockResolvedValueOnce({ count: 1 });

    const result = await applyVoiceEvent(
      { type: "join", discordId: "1", name: "Kiara", channelId: "10" },
      NOW
    );

    expect(result).toEqual({ closed: 1, opened: 1 });
    expect(prisma.discordVoiceSession.updateMany).toHaveBeenCalledWith({
      where: { discordId: "1", leftAt: null },
      data: { leftAt: NOW },
    });
    expect(prisma.discordVoiceSession.create).toHaveBeenCalledWith({
      data: { discordId: "1", name: "Kiara", channelId: "10", joinedAt: NOW },
    });
  });

  it("reconciles a snapshot: keeps matching sessions, closes stale ones, opens missing ones", async () => {
    const { applyVoiceEvent, prisma } = await load();
    prisma.discordVoiceSession.findMany.mockResolvedValueOnce([
      { id: "s1", discordId: "1", channelId: "10" },
      { id: "s2", discordId: "2", channelId: "10" },
      { id: "s3", discordId: "3", channelId: "11" },
      { id: "s4", discordId: "1", channelId: "10" },
    ]);

    const result = await applyVoiceEvent(
      {
        type: "snapshot",
        members: [
          { discordId: "1", name: "Kiara", channelId: "10" },
          { discordId: "3", name: "Abisan", channelId: "12" },
          { discordId: "4", name: "Denmar", channelId: "10" },
        ],
      },
      NOW
    );

    expect(result).toEqual({ closed: 3, opened: 2 });
    expect(prisma.discordVoiceSession.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["s2", "s3", "s4"] } },
      data: { leftAt: NOW },
    });
    expect(prisma.discordVoiceSession.createMany).toHaveBeenCalledWith({
      data: [
        { discordId: "3", name: "Abisan", channelId: "12", joinedAt: NOW },
        { discordId: "4", name: "Denmar", channelId: "10", joinedAt: NOW },
      ],
    });
  });

  it("does nothing for an empty snapshot with nothing open", async () => {
    const { applyVoiceEvent, prisma } = await load();

    const result = await applyVoiceEvent({ type: "snapshot", members: [] }, NOW);

    expect(result).toEqual({ closed: 0, opened: 0 });
    expect(prisma.discordVoiceSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.discordVoiceSession.createMany).not.toHaveBeenCalled();
  });

  it("rejects malformed events", async () => {
    const { voiceEventSchema } = await load();
    expect(voiceEventSchema.safeParse({ type: "join", discordId: "x" }).success).toBe(false);
    expect(voiceEventSchema.safeParse({ type: "dance" }).success).toBe(false);
  });
});

describe("recordMessages", () => {
  beforeEach(() => vi.resetModules());

  it("adds to a day's count in add mode and replaces it in set mode", async () => {
    const { recordMessages, messagesSchema, prisma } = await load();
    const entry = { discordId: "1", name: "Kiara", day: "2026-10-30", count: 3 };

    expect(await recordMessages(messagesSchema.parse({ entries: [entry] }))).toBe(1);
    expect(prisma.discordMessageDay.upsert).toHaveBeenLastCalledWith({
      where: { discordId_day: { discordId: "1", day: "2026-10-30" } },
      create: entry,
      update: { name: "Kiara", count: { increment: 3 } },
    });

    await recordMessages(messagesSchema.parse({ mode: "set", entries: [entry] }));
    expect(prisma.discordMessageDay.upsert).toHaveBeenLastCalledWith({
      where: { discordId_day: { discordId: "1", day: "2026-10-30" } },
      create: entry,
      update: { name: "Kiara", count: 3 },
    });
  });

  it("rejects bad days, empty batches and zero counts", async () => {
    const { messagesSchema } = await load();
    const good = { discordId: "1", name: "K", day: "2026-10-30", count: 1 };
    expect(messagesSchema.safeParse({ entries: [] }).success).toBe(false);
    expect(messagesSchema.safeParse({ entries: [{ ...good, day: "Oct 30" }] }).success).toBe(false);
    expect(messagesSchema.safeParse({ entries: [{ ...good, count: 0 }] }).success).toBe(false);
  });
});

describe("recordWordleStreak", () => {
  beforeEach(() => vi.resetModules());

  it("keeps a single streak row", async () => {
    const { recordWordleStreak, prisma } = await load();

    await recordWordleStreak({ streak: 80, postedOn: "2026-10-30" });

    expect(prisma.discordWordleStreak.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, streak: 80, postedOn: "2026-10-30" },
      update: { streak: 80, postedOn: "2026-10-30" },
    });
  });
});
