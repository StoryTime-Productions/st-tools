import { beforeEach, describe, expect, it, vi } from "vitest";

async function load(rows: unknown[] = []) {
  const prisma = {
    discordBirthday: {
      findMany: vi.fn().mockResolvedValue(rows),
      deleteMany: vi.fn((args: unknown) => args),
      upsert: vi.fn((args: unknown) => args),
    },
    discordStatsPulse: { upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  return {
    ...(await import("@/lib/discord-birthdays")),
    ...(await import("@/lib/discord-ingest")),
    prisma,
  };
}

const row = (discordId: string, name: string, month: number, day: number) => ({
  discordId,
  name,
  avatarUrl: null,
  month,
  day,
});

describe("daysUntilBirthday", () => {
  beforeEach(() => vi.resetModules());

  it("is 0 today, counts forward and wraps into next year", async () => {
    const { daysUntilBirthday } = await load();
    expect(daysUntilBirthday("2026-11-01", 11, 1)).toBe(0);
    expect(daysUntilBirthday("2026-11-01", 11, 14)).toBe(13);
    expect(daysUntilBirthday("2026-11-01", 10, 31)).toBe(364);
    expect(daysUntilBirthday("2026-12-31", 1, 1)).toBe(1);
  });

  it("treats Feb 29 as Feb 28 in years without one", async () => {
    const { daysUntilBirthday } = await load();
    expect(daysUntilBirthday("2026-02-27", 2, 29)).toBe(1);
    expect(daysUntilBirthday("2028-02-27", 2, 29)).toBe(2);
    expect(daysUntilBirthday("2026-11-01", 2, 29)).toBe(119);
  });
});

describe("getUpcomingBirthdays", () => {
  beforeEach(() => vi.resetModules());

  it("returns the soonest three in Toronto time, ties by name", async () => {
    const { getUpcomingBirthdays } = await load([
      row("1", "Zed", 11, 14),
      row("2", "Amy", 11, 14),
      row("3", "Bob", 11, 2),
      row("4", "Cat", 3, 1),
    ]);
    // 2026-11-02 01:00 UTC is still Nov 1 in Toronto.
    const result = await getUpcomingBirthdays(new Date("2026-11-02T01:00:00Z"));
    expect(result.map((b) => [b.name, b.daysUntil])).toEqual([
      ["Bob", 1],
      ["Amy", 13],
      ["Zed", 13],
    ]);
  });
});

describe("replaceBirthdays", () => {
  beforeEach(() => vi.resetModules());

  it("drops people missing from the list, upserts the rest and pings the dashboard", async () => {
    const { replaceBirthdays, prisma } = await load();
    const count = await replaceBirthdays({
      birthdays: [{ discordId: "1", name: "Kiara", month: 11, day: 14 }],
    });

    expect(count).toBe(1);
    expect(prisma.discordBirthday.deleteMany).toHaveBeenCalledWith({
      where: { discordId: { notIn: ["1"] } },
    });
    expect(prisma.discordBirthday.upsert).toHaveBeenCalledWith({
      where: { discordId: "1" },
      create: { discordId: "1", name: "Kiara", month: 11, day: 14, avatarUrl: null },
      update: { name: "Kiara", avatarUrl: null, month: 11, day: 14 },
    });
    expect(prisma.discordStatsPulse.upsert).toHaveBeenCalled();
  });

  it("clears everything when the list is empty", async () => {
    const { replaceBirthdays, prisma } = await load();
    await replaceBirthdays({ birthdays: [] });
    expect(prisma.discordBirthday.deleteMany).toHaveBeenCalledWith({
      where: { discordId: { notIn: [] } },
    });
  });
});
