import { beforeEach, describe, expect, it, vi } from "vitest";

async function load() {
  const prisma = {
    discordMessageDay: { findMany: vi.fn().mockResolvedValue([]) },
    discordVoiceSession: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    discordWordleStreak: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const mod = await import("@/lib/discord-stats");
  return { ...mod, prisma };
}

// Wednesday 9 PM in Toronto is already Thursday 01:00 UTC: the week must still be Mon Oct 26.
const WED_NIGHT = new Date("2026-10-29T01:00:00Z");

describe("rangeBounds", () => {
  beforeEach(() => vi.resetModules());

  it("uses Monday to Sunday Toronto days for the week, even late on a Wednesday", async () => {
    const { rangeBounds } = await load();
    const week = rangeBounds("week", WED_NIGHT);

    expect(week.startDay).toBe("2026-10-26");
    expect(week.endDay).toBe("2026-11-02");
    expect(week.title).toBe("This week");
    // 2026-10-26 00:00 EDT = 04:00Z; the week crosses the Nov 1 DST end, so the end is 05:00Z.
    expect(week.start.toISOString()).toBe("2026-10-26T04:00:00.000Z");
    expect(week.end.toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });

  it("treats Sunday as the last day of the week", async () => {
    const { rangeBounds } = await load();
    expect(rangeBounds("week", new Date("2026-11-01T15:00:00Z")).startDay).toBe("2026-10-26");
    expect(rangeBounds("week", new Date("2026-11-02T15:00:00Z")).startDay).toBe("2026-11-02");
  });

  it("covers the calendar month and year", async () => {
    const { rangeBounds } = await load();
    const month = rangeBounds("month", new Date("2026-12-15T15:00:00Z"));
    expect([month.startDay, month.endDay, month.title]).toEqual([
      "2026-12-01",
      "2027-01-01",
      "This month",
    ]);
    const year = rangeBounds("year", new Date("2026-12-15T15:00:00Z"));
    expect([year.startDay, year.endDay, year.title]).toEqual([
      "2026-01-01",
      "2027-01-01",
      "This year",
    ]);
  });
});

describe("getDiscordStats", () => {
  beforeEach(() => vi.resetModules());

  it("ranks messages by total, keeps the newest name, breaks ties by name and honours the limit", async () => {
    const { getDiscordStats, prisma } = await load();
    prisma.discordMessageDay.findMany.mockResolvedValueOnce([
      { discordId: "1", name: "Old Kiara", day: "2026-10-26", count: 5 },
      { discordId: "1", name: "Kiara", day: "2026-10-28", count: 5 },
      { discordId: "2", name: "Denmar", day: "2026-10-27", count: 10 },
      { discordId: "3", name: "Abisan", day: "2026-10-27", count: 4 },
      { discordId: "4", name: "Annika", day: "2026-10-27", count: 4 },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ discordId: "1", avatarUrl: "https://a/k.png" }]);

    const stats = await getDiscordStats("week", WED_NIGHT, 3);

    expect(stats.title).toBe("This week");
    expect(stats.messages.map((row) => [row.name, row.total])).toEqual([
      ["Denmar", 10],
      ["Kiara", 10],
      ["Abisan", 4],
    ]);
    expect(stats.messages[1].avatarUrl).toBe("https://a/k.png");
    expect(stats.messages[0].avatarUrl).toBeNull();
    expect(prisma.discordMessageDay.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { day: { gte: "2026-10-26", lt: "2026-11-02" } } })
    );
  });

  it("counts voice minutes clipped to the range, open sessions up to now, and skips empty totals", async () => {
    const { getDiscordStats, prisma } = await load();
    prisma.discordVoiceSession.findMany.mockResolvedValueOnce([
      // Started before the week: only the 60 minutes inside the week count.
      {
        discordId: "1",
        name: "Kiara",
        joinedAt: new Date("2026-10-25T23:00:00Z"),
        leftAt: new Date("2026-10-26T05:00:00Z"),
      },
      // Open session: counts up to now (Wed 01:00Z), 90 minutes.
      { discordId: "2", name: "Denmar", joinedAt: new Date("2026-10-28T23:30:00Z"), leftAt: null },
      // Joined and left within the same second: zero minutes, left out.
      {
        discordId: "3",
        name: "Abisan",
        joinedAt: new Date("2026-10-27T12:00:00Z"),
        leftAt: new Date("2026-10-27T12:00:20Z"),
      },
      // A second session for Kiara adds to her total and updates her name.
      {
        discordId: "1",
        name: "Kiara P",
        joinedAt: new Date("2026-10-27T12:00:00Z"),
        leftAt: new Date("2026-10-27T12:30:00Z"),
      },
    ]);
    prisma.discordVoiceSession.findFirst.mockResolvedValueOnce({
      joinedAt: new Date("2026-10-25T23:00:00Z"),
    });

    const stats = await getDiscordStats("week", WED_NIGHT);

    expect(stats.voice.map((row) => [row.name, row.total])).toEqual([
      ["Denmar", 90],
      ["Kiara P", 90],
    ]);
    expect(stats.voiceTrackedSince).toBe("2026-10-25");
  });

  it("reports no voice history and no leaders when nothing was recorded", async () => {
    const { getDiscordStats, prisma } = await load();

    const stats = await getDiscordStats("year", WED_NIGHT);

    expect(stats).toMatchObject({ messages: [], voice: [], voiceTrackedSince: null });
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});

describe("getVoiceNow and getWordleStreak", () => {
  beforeEach(() => vi.resetModules());

  it("lists open sessions with avatars for people who have an account", async () => {
    const { getVoiceNow, prisma } = await load();
    const joinedAt = new Date("2026-10-30T20:00:00Z");
    prisma.discordVoiceSession.findMany.mockResolvedValueOnce([
      { discordId: "1", name: "Kiara", channelName: "D&D", joinedAt },
      { discordId: "2", name: "Denmar", channelName: "D&D", joinedAt },
    ]);
    prisma.user.findMany.mockResolvedValueOnce([{ discordId: "2", avatarUrl: "https://a/d.png" }]);

    expect(await getVoiceNow()).toEqual([
      { discordId: "1", name: "Kiara", channelName: "D&D", joinedAt, avatarUrl: null },
      {
        discordId: "2",
        name: "Denmar",
        channelName: "D&D",
        joinedAt,
        avatarUrl: "https://a/d.png",
      },
    ]);
  });

  it("is empty when nobody is on a call", async () => {
    const { getVoiceNow } = await load();
    expect(await getVoiceNow()).toEqual([]);
  });

  it("returns the stored Wordle streak, or null before the first post", async () => {
    const { getWordleStreak, prisma } = await load();
    expect(await getWordleStreak()).toBeNull();

    prisma.discordWordleStreak.findUnique.mockResolvedValueOnce({
      id: 1,
      streak: 80,
      postedOn: "2026-10-30",
      updatedAt: new Date(),
    });
    expect(await getWordleStreak()).toEqual({ streak: 80, postedOn: "2026-10-30" });
  });
});
