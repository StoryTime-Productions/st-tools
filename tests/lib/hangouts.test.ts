import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadHangoutsLib() {
  const prisma = {
    hangout: { findMany: vi.fn(), findUnique: vi.fn() },
    hangoutIdea: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  };
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const lib = await import("@/lib/hangouts");
  return { ...lib, prisma };
}

describe("hangout data loaders", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("lists every hangout, newest first", async () => {
    const { getHangoutSummaries, prisma } = await loadHangoutsLib();
    prisma.hangout.findMany.mockResolvedValue([
      { id: "h1", status: "COLLECTING", startSlot: null, stops: [], costs: [] },
      {
        id: "h2",
        status: "SCHEDULED",
        startSlot: "2020-01-01T19:30",
        stops: [],
        costs: [
          { shares: [{ status: "SENT", amountCents: 1000, paidCents: 1000 }] },
          { shares: [{ status: "CONFIRMED", amountCents: 1000, paidCents: 1000 }] },
        ],
      },
    ]);

    await expect(getHangoutSummaries()).resolves.toEqual([
      { id: "h1", status: "COLLECTING", startSlot: null, phase: "COLLECTING", unpaid: 0 },
      {
        id: "h2",
        status: "SCHEDULED",
        startSlot: "2020-01-01T19:30",
        phase: "SETTLING_UP",
        unpaid: 1,
      },
    ]);
    expect(prisma.hangout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "desc" } })
    );
  });

  it("knows a hangout has ended only once its scheduled end time passes", async () => {
    const { hangoutEnded, prisma } = await loadHangoutsLib();
    const stops = [{ durationMinutes: 60, arriveBy: null }];
    const check = (hangout: object | null) => {
      prisma.hangout.findUnique.mockResolvedValueOnce(hangout);
      return hangoutEnded("h1");
    };

    await expect(check(null)).resolves.toBe(false);
    await expect(check({ status: "COLLECTING", startSlot: null, stops })).resolves.toBe(false);
    await expect(
      check({ status: "SCHEDULED", startSlot: "2999-01-01T19:30", stops })
    ).resolves.toBe(false);
    await expect(
      check({ status: "SCHEDULED", startSlot: "2020-01-01T19:30", stops })
    ).resolves.toBe(true);
  });

  it("loads one hangout by id", async () => {
    const { getHangoutDetail, prisma } = await loadHangoutsLib();
    prisma.hangout.findUnique.mockResolvedValue(null);

    await expect(getHangoutDetail("h1")).resolves.toBeNull();
    expect(prisma.hangout.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "h1" } })
    );
  });

  it("flattens the proposer and attendee names", async () => {
    const { getHangoutDetail, prisma } = await loadHangoutsLib();
    const base = { id: "h1", title: "Karaoke", description: null };
    prisma.hangout.findUnique
      .mockResolvedValueOnce({
        ...base,
        idea: { proposerName: "sam#1" },
        attendees: [
          { userId: "a", status: "GOING", user: { name: "Alice", email: "a@x.gg" } },
          { userId: "b", status: "MAYBE", user: { name: null, email: "b@x.gg" } },
        ],
        cars: [
          {
            id: "car1",
            seats: 3,
            startAddress: null,
            commonPoint: "Union Station",
            driver: {
              id: "a",
              name: "Alice",
              email: "a@x.gg",
              homeAddress: "1 Main St",
              homeLat: 43.6,
              homeLon: -79.4,
            },
            riders: [
              {
                atCommonPoint: true,
                user: {
                  id: "b",
                  name: null,
                  email: "b@x.gg",
                  homeAddress: null,
                  homeLat: null,
                  homeLon: null,
                },
              },
            ],
          },
        ],
        costs: [
          {
            id: "c1",
            title: "Dinner",
            amountCents: 6000,
            notes: null,
            collector: { id: "a", name: "Alice", email: "a@x.gg" },
            participants: [{ user: { id: "b", name: null, email: "b@x.gg" } }],
            shares: [
              {
                amountCents: 2000,
                paidCents: 0,
                status: "UNPAID",
                method: null,
                user: { id: "b", name: null, email: "b@x.gg" },
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ ...base, idea: null, attendees: [], cars: [], costs: [] });

    await expect(getHangoutDetail("h1")).resolves.toEqual({
      ...base,
      unpaid: 1,
      proposerName: "sam#1",
      attendees: [
        { userId: "a", status: "GOING", name: "Alice" },
        { userId: "b", status: "MAYBE", name: "b@x.gg" },
      ],
      cars: [
        {
          id: "car1",
          seats: 3,
          startAddress: null,
          commonPoint: "Union Station",
          driver: {
            userId: "a",
            name: "Alice",
            homeAddress: "1 Main St",
            homeLat: 43.6,
            homeLon: -79.4,
          },
          riders: [
            {
              userId: "b",
              name: "b@x.gg",
              homeAddress: null,
              homeLat: null,
              homeLon: null,
              atCommonPoint: true,
            },
          ],
        },
      ],
      costs: [
        {
          id: "c1",
          title: "Dinner",
          amountCents: 6000,
          notes: null,
          collector: { userId: "a", name: "Alice" },
          participants: [{ userId: "b", name: "b@x.gg" }],
          shares: [
            {
              userId: "b",
              name: "b@x.gg",
              amountCents: 2000,
              paidCents: 0,
              status: "UNPAID",
              method: null,
            },
          ],
        },
      ],
    });
    await expect(getHangoutDetail("h1")).resolves.toEqual({
      ...base,
      unpaid: 0,
      proposerName: null,
      attendees: [],
      cars: [],
      costs: [],
    });
  });

  it("lists members by name, falling back to email", async () => {
    const { getMemberOptions, prisma } = await loadHangoutsLib();
    prisma.user.findMany.mockResolvedValue([
      { id: "a", name: "Alice", email: "a@x.gg" },
      { id: "b", name: null, email: "b@x.gg" },
    ]);
    await expect(getMemberOptions()).resolves.toEqual([
      { id: "a", name: "Alice" },
      { id: "b", name: "b@x.gg" },
    ]);
  });

  it("lists open ideas with linked accounts preferred over Discord names", async () => {
    const { getOpenIdeas, prisma } = await loadHangoutsLib();
    const createdAt = new Date("2026-09-28T12:00:00Z");
    prisma.hangoutIdea.findMany.mockResolvedValue([
      {
        id: "i1",
        title: "Karaoke",
        details: null,
        createdAt,
        proposerName: "sam",
        proposerDiscordId: "d1",
      },
      {
        id: "i2",
        title: "Hike",
        details: "Rattlesnake",
        createdAt,
        proposerName: "kai",
        proposerDiscordId: "d2",
      },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { discordId: "d1", name: "Sam Lee", avatarUrl: "https://a/sam.png" },
    ]);

    await expect(getOpenIdeas()).resolves.toEqual([
      {
        id: "i1",
        title: "Karaoke",
        details: null,
        createdAt,
        proposerName: "Sam Lee",
        proposerAvatarUrl: "https://a/sam.png",
      },
      {
        id: "i2",
        title: "Hike",
        details: "Rattlesnake",
        createdAt,
        proposerName: "kai",
        proposerAvatarUrl: null,
      },
    ]);
    expect(prisma.hangoutIdea.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { hangoutId: null }, orderBy: { createdAt: "desc" } })
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { discordId: { in: ["d1", "d2"] } } })
    );
  });

  it("spans locked hangouts to their itinerary end and collecting ones over candidate dates", async () => {
    const { getCalendarHangouts, prisma } = await loadHangoutsLib();
    prisma.hangout.findMany.mockResolvedValue([
      {
        id: "h1",
        title: "Board games",
        status: "SCHEDULED",
        startSlot: "2026-10-03T19:30",
        availabilityDates: ["2026-10-02", "2026-10-03"],
        stops: [
          { durationMinutes: 60, arriveBy: null },
          { durationMinutes: 180, arriveBy: "1T23:00" },
        ],
        _count: { attendees: 3 },
      },
      {
        id: "h2",
        title: "Karaoke",
        status: "COLLECTING",
        startSlot: null,
        availabilityDates: ["2026-10-09", "2026-10-10"],
        stops: [],
        _count: { attendees: 0 },
      },
    ]);

    await expect(getCalendarHangouts()).resolves.toEqual([
      {
        id: "h1",
        title: "Board games",
        status: "SCHEDULED",
        startSlot: "2026-10-03T19:30",
        days: ["2026-10-03", "2026-10-04"],
        goingCount: 3,
      },
      {
        id: "h2",
        title: "Karaoke",
        status: "COLLECTING",
        startSlot: null,
        days: ["2026-10-09", "2026-10-10"],
        goingCount: 0,
      },
    ]);
    expect(prisma.hangout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["COLLECTING", "SCHEDULED"] } } })
    );
  });
});
