import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "22222222-2222-4222-8222-222222222222";

async function load() {
  const prisma = {
    hangoutPendingUpdate: { create: vi.fn() },
    hangout: {
      findUnique: vi.fn().mockResolvedValue({
        title: "Karaoke",
        coverImageUrl: "https://img.test/c.png",
        startSlot: "2026-10-03T19:30",
        discordThreadId: "t-1",
        attendees: [{ status: "GOING" }, { status: "GOING" }, { status: "MAYBE" }],
      }),
    },
  };
  const postToChannel = vi.fn().mockResolvedValue("m-1");
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/discord", () => ({ postToChannel }));
  vi.doMock("@/lib/hangout-discord", () => ({ siteUrl: async () => "https://tools.test" }));
  const mod = await import("@/lib/hangout-updates");
  return { ...mod, prisma, postToChannel };
}

describe("hangout updates", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("formats money", async () => {
    const { money } = await load();
    expect(money(4005)).toBe("$40.05");
  });

  it("queues a trimmed line and swallows database errors", async () => {
    const { queueUpdate, prisma } = await load();

    await queueUpdate(ID, "Costs", "—", `**${"x".repeat(200)}`);
    const data = prisma.hangoutPendingUpdate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ hangoutId: ID, area: "Costs", before: "—" });
    expect(data.after).toHaveLength(80);
    expect(data.after).not.toContain("*");

    prisma.hangoutPendingUpdate.create.mockRejectedValueOnce(new Error("db down"));
    await expect(queueUpdate(ID, "Costs", "a", "b")).resolves.toBeUndefined();
  });

  it("posts the grey cancel embed to the thread", async () => {
    const { announceCancel, postToChannel } = await load();

    await announceCancel(ID);

    const embed = postToChannel.mock.calls[0][1].embeds[0];
    expect(postToChannel.mock.calls[0][0]).toBe("t-1");
    expect(embed).toMatchObject({ title: "Cancelled", color: 0x6b7280 });
  });

  it("posts the lock-in embed with start time, cover and counts", async () => {
    const { announceLockIn, postToChannel } = await load();

    await announceLockIn(ID);

    const embed = postToChannel.mock.calls[0][1].embeds[0];
    expect(embed.title).toBe("Locked in");
    expect(embed.timestamp).toBe("2026-10-03T23:30:00.000Z");
    expect(embed.image).toEqual({ url: "https://img.test/c.png" });
    const values = embed.fields.map((f: { value: string }) => f.value);
    expect(values).toContain("2");
    expect(values).toContain("1");
  });

  it("does nothing without a thread or start time, and swallows errors", async () => {
    const { announceCancel, announceLockIn, postToChannel, prisma } = await load();

    prisma.hangout.findUnique.mockResolvedValue({ discordThreadId: null });
    await announceCancel(ID);
    await announceLockIn(ID);
    prisma.hangout.findUnique.mockResolvedValue(null);
    await announceCancel(ID);
    prisma.hangout.findUnique.mockResolvedValue({ discordThreadId: "t-1", startSlot: null });
    await announceLockIn(ID);
    expect(postToChannel).not.toHaveBeenCalled();

    prisma.hangout.findUnique.mockRejectedValue(new Error("db down"));
    await expect(announceCancel(ID)).resolves.toBeUndefined();
    await expect(announceLockIn(ID)).resolves.toBeUndefined();
  });
});
