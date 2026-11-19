import { beforeEach, describe, expect, it, vi } from "vitest";

async function load(rows: unknown[] = [], count = 0) {
  const prisma = {
    countdown: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(count),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  return { ...(await import("@/lib/countdowns")), prisma };
}

const NOW = new Date("2026-11-13T12:00:00Z");
const at = (ms: number) => new Date(NOW.getTime() + ms);
const H = 3_600_000;
const D = 24 * H;

const view = (id: string, targetAt: Date, over: Record<string, unknown> = {}) => ({
  id,
  title: id,
  targetAt,
  scope: "GLOBAL" as const,
  ownerId: "u1",
  audienceCount: null,
  audienceUserIds: [],
  applies: true,
  dismissed: false,
  ...over,
});

describe("countdown helpers", () => {
  beforeEach(() => vi.resetModules());

  it("expires personal countdowns 24 h after they fire and never global ones", async () => {
    const { expiryFor } = await load();
    expect(expiryFor("PERSONAL", NOW)).toEqual(at(D));
    expect(expiryFor("GLOBAL", NOW)).toBeNull();
  });

  it("tidies and caps titles", async () => {
    const { normalizeTitle } = await load();
    expect(normalizeTitle("  Big   day  ")).toBe("Big day");
    expect(normalizeTitle("x".repeat(80))).toHaveLength(60);
  });

  it("knows when a target is reached, including exactly now", async () => {
    const { hasReached } = await load();
    expect(hasReached(NOW, NOW)).toBe(true);
    expect(hasReached(at(1), NOW)).toBe(false);
  });

  it("words the time left as text", async () => {
    const { remainingLabel } = await load();
    expect(remainingLabel(at(-1), NOW)).toBe("Reached");
    expect(remainingLabel(at(5 * D), NOW)).toBe("in 5 days");
    expect(remainingLabel(at(D + H), NOW)).toBe("in 1 day");
    expect(remainingLabel(at(2 * H + 5 * 60_000), NOW)).toBe("in 2 h 05 m");
    expect(remainingLabel(at(12 * 60_000), NOW)).toBe("in 12 min");
    expect(remainingLabel(at(30_000), NOW)).toBe("in under a minute");
  });

  it("labels the audience", async () => {
    const { audienceLabel } = await load();
    expect(audienceLabel({ scope: "PERSONAL", audienceCount: null })).toBe("Only you");
    expect(audienceLabel({ scope: "GLOBAL", audienceCount: null })).toBe("Everyone");
    expect(audienceLabel({ scope: "GLOBAL", audienceCount: 1 })).toBe("1 person");
    expect(audienceLabel({ scope: "GLOBAL", audienceCount: 3 })).toBe("3 people");
  });

  it("sorts global first, then soonest", async () => {
    const { sortCountdowns } = await load();
    const list = [
      view("p-late", at(3 * H), { scope: "PERSONAL" }),
      view("g-late", at(2 * H)),
      view("p-soon", at(H), { scope: "PERSONAL" }),
      view("g-soon", at(H)),
    ];
    expect(sortCountdowns(list).map((c) => c.id)).toEqual(["g-soon", "g-late", "p-soon", "p-late"]);
  });

  it("picks an unacknowledged fired alarm over anything upcoming", async () => {
    const { pickTitleCountdown } = await load();
    const list = [
      view("soon", at(H)),
      view("fired", at(-H)),
      view("seen", at(-2 * H), { dismissed: true }),
    ];
    const pick = pickTitleCountdown(list, NOW);
    expect(pick?.countdown.id).toBe("fired");
    expect(pick?.reached).toBe(true);
  });

  it("shows the earliest of several fired alarms", async () => {
    const { pickTitleCountdown } = await load();
    const list = [view("later", at(-H)), view("earlier", at(-3 * H))];
    expect(pickTitleCountdown(list, NOW)?.countdown.id).toBe("earlier");
  });

  it("ignores countdowns that are for other people", async () => {
    const { pickTitleCountdown } = await load();
    const list = [
      view("theirs-fired", at(-H), { applies: false }),
      view("theirs-soon", at(H), { applies: false }),
    ];
    expect(pickTitleCountdown(list, NOW)).toBeNull();
  });

  it("picks the soonest within 24 h and ignores farther or dismissed ones", async () => {
    const { pickTitleCountdown } = await load();
    const list = [
      view("far", at(2 * D)),
      view("b", at(5 * H)),
      view("a", at(2 * H)),
      view("seen", at(-H), { dismissed: true }),
    ];
    expect(pickTitleCountdown(list, NOW)).toEqual({ countdown: list[2], reached: false });
    expect(pickTitleCountdown([view("far", at(2 * D))], NOW)).toBeNull();
    expect(pickTitleCountdown([], NOW)).toBeNull();
  });
});

describe("countdown queries", () => {
  beforeEach(() => vi.resetModules());

  it("returns what the user can see, global first, with audience size and dismissal", async () => {
    const row = (
      id: string,
      scope: string,
      hours: number,
      audience: number,
      dismissed: boolean
    ) => ({
      id,
      title: id,
      targetAt: at(hours * H),
      scope,
      ownerId: "u1",
      _count: { audience },
      dismissals: dismissed ? [{ userId: "me" }] : [],
    });
    const { getVisibleCountdowns, prisma } = await load([
      row("mine", "PERSONAL", 1, 0, false),
      row("all", "GLOBAL", 3, 0, true),
      row("some", "GLOBAL", 2, 4, false),
    ]);
    const out = await getVisibleCountdowns("me", NOW);
    expect(out.map((c) => [c.id, c.audienceCount, c.dismissed])).toEqual([
      ["some", 4, false],
      ["all", null, true],
      ["mine", null, false],
    ]);
    const where = prisma.countdown.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain('"audience":{"some":{"userId":"me"}}');
  });

  it("loads the chosen members for an admin only", async () => {
    const row = {
      id: "g",
      title: "g",
      targetAt: at(H),
      scope: "GLOBAL",
      ownerId: "u1",
      _count: { audience: 2 },
      audience: [{ userId: "a" }, { userId: "b" }],
      dismissals: [],
    };
    const { getVisibleCountdowns, prisma } = await load([row]);
    const [out] = await getVisibleCountdowns("me", NOW, { asAdmin: true });
    expect(out.audienceUserIds).toEqual(["a", "b"]);
    expect(prisma.countdown.findMany.mock.calls[0][0].include.audience).toEqual({
      select: { userId: true },
    });
    await getVisibleCountdowns("me", NOW);
    expect(prisma.countdown.findMany.mock.calls[1][0].include.audience).toBe(false);
  });

  it("lets an admin see every global countdown and flags the ones meant for others", async () => {
    const row = (id: string, audience: { userId: string }[]) => ({
      id,
      title: id,
      targetAt: at(H),
      scope: "GLOBAL",
      ownerId: "u1",
      _count: { audience: audience.length },
      audience,
      dismissals: [],
    });
    const { getVisibleCountdowns, prisma } = await load([
      row("everyone", []),
      row("with-me", [{ userId: "me" }, { userId: "x" }]),
      row("others", [{ userId: "x" }]),
    ]);
    const out = await getVisibleCountdowns("me", NOW, { asAdmin: true });
    expect(out.map((c) => [c.id, c.applies])).toEqual([
      ["everyone", true],
      ["with-me", true],
      ["others", false],
    ]);
    expect(JSON.stringify(prisma.countdown.findMany.mock.calls[0][0].where)).toContain(
      '{"scope":"GLOBAL"}'
    );
  });

  it("counts only active personal countdowns and deletes expired ones", async () => {
    const { countPersonalCountdowns, deleteExpiredCountdowns, prisma } = await load([], 7);
    expect(await countPersonalCountdowns("me", NOW)).toBe(7);
    expect(prisma.countdown.count).toHaveBeenCalledWith({
      where: { scope: "PERSONAL", ownerId: "me", expiresAt: { gt: NOW } },
    });
    await deleteExpiredCountdowns(NOW);
    expect(prisma.countdown.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lte: NOW } },
    });
  });
});
