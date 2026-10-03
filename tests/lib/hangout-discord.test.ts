import { beforeEach, describe, expect, it, vi } from "vitest";

const ID = "22222222-2222-4222-8222-222222222222";
const HANGOUT = {
  title: "Karaoke",
  description: "Sing loudly. Bring snacks.",
  coverImageUrl: null,
  discordThreadUrl: null,
  discordThreadId: null,
  availabilityDates: [],
  availabilityDeadline: null,
  startSlot: null,
  idea: { proposerName: "Alice" },
};

async function load() {
  const prisma = {
    hangout: { findUnique: vi.fn().mockResolvedValue(HANGOUT), update: vi.fn() },
    hangoutAttendee: { count: vi.fn().mockResolvedValueOnce(2).mockResolvedValueOnce(1) },
  };
  const startThread = vi.fn().mockResolvedValue({ threadId: "t-1", messageId: "m-1" });
  const renameThread = vi.fn().mockResolvedValue(true);
  const editMessage = vi.fn().mockResolvedValue(true);
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/discord", () => ({ startThread, renameThread, editMessage }));
  vi.doMock("next/headers", () => ({
    headers: async () => new Headers({ origin: "https://tools.test" }),
  }));
  const mod = await import("@/lib/hangout-discord");
  return { ...mod, prisma, startThread, renameThread, editMessage };
}

describe("threadName", () => {
  it("adds the day once scheduled and respects the 100 character cap", async () => {
    const { threadName } = await load();

    expect(threadName("Karaoke", null)).toBe("Karaoke");
    expect(threadName("Karaoke", "2026-10-03T19:30")).toBe("Karaoke · Oct 3");
    expect(threadName("x".repeat(200), "2026-10-03T19:30")).toHaveLength(100);
  });
});

describe("announceHangout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("DISCORD_HANGOUTS_CHANNEL_ID", "chan-1");
    vi.stubEnv("DISCORD_GUILD_ID", "guild-1");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("starts a thread and stores its ids and url", async () => {
    const mod = await load();

    await mod.announceHangout(ID);

    const [channel, name, message] = mod.startThread.mock.calls[0];
    expect(channel).toBe("chan-1");
    expect(name).toBe("Karaoke");
    expect(message.embeds[0]).toMatchObject({
      title: "Karaoke",
      url: `https://tools.test/hub/hangouts/${ID}`,
    });
    expect(message.embeds[0].fields[0]).toEqual({
      name: "Proposed by",
      value: "Alice",
      inline: true,
    });
    expect(mod.prisma.hangout.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: {
        discordThreadId: "t-1",
        discordMessageId: "m-1",
        discordThreadUrl: "https://discord.com/channels/guild-1/t-1",
      },
    });
  });

  it("stores only the ids when no guild id is configured", async () => {
    vi.stubEnv("DISCORD_GUILD_ID", "");
    const mod = await load();
    mod.prisma.hangout.findUnique.mockResolvedValue({ ...HANGOUT, idea: null });

    await mod.announceHangout(ID);

    expect(mod.prisma.hangout.update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { discordThreadId: "t-1", discordMessageId: "m-1" },
    });
  });

  it("skips without a channel, a hangout, or when a thread already exists", async () => {
    const mod = await load();

    vi.stubEnv("DISCORD_HANGOUTS_CHANNEL_ID", "");
    await mod.announceHangout(ID);
    vi.stubEnv("DISCORD_HANGOUTS_CHANNEL_ID", "chan-1");

    mod.prisma.hangout.findUnique.mockResolvedValueOnce(null);
    await mod.announceHangout(ID);
    mod.prisma.hangout.findUnique.mockResolvedValueOnce({ ...HANGOUT, discordThreadId: "t-0" });
    await mod.announceHangout(ID);
    mod.prisma.hangout.findUnique.mockResolvedValueOnce({
      ...HANGOUT,
      discordThreadUrl: "https://discord.com/channels/1/2",
    });
    await mod.announceHangout(ID);

    expect(mod.startThread).not.toHaveBeenCalled();
  });

  it("stores nothing when the post fails and never throws", async () => {
    const mod = await load();

    mod.startThread.mockResolvedValueOnce(null);
    await expect(mod.announceHangout(ID)).resolves.toBeUndefined();
    expect(mod.prisma.hangout.update).not.toHaveBeenCalled();

    mod.prisma.hangout.findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(mod.announceHangout(ID)).resolves.toBeUndefined();
  });
});

describe("renameHangoutThread", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renames the thread with the locked day", async () => {
    const mod = await load();
    mod.prisma.hangout.findUnique.mockResolvedValue({
      title: "Karaoke",
      startSlot: "2026-10-03T19:30",
      discordThreadId: "t-1",
    });

    await mod.renameHangoutThread(ID);

    expect(mod.renameThread).toHaveBeenCalledWith("t-1", "Karaoke · Oct 3");
  });

  it("does nothing without a thread and never throws", async () => {
    const mod = await load();
    mod.prisma.hangout.findUnique.mockResolvedValueOnce({
      title: "Karaoke",
      startSlot: null,
      discordThreadId: null,
    });
    await mod.renameHangoutThread(ID);
    expect(mod.renameThread).not.toHaveBeenCalled();

    mod.prisma.hangout.findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(mod.renameHangoutThread(ID)).resolves.toBeUndefined();
  });
});

describe("refreshAnnouncement", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("DISCORD_HANGOUTS_CHANNEL_ID", "chan-1");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("edits the opener in place with the live counts", async () => {
    const mod = await load();
    mod.prisma.hangout.findUnique.mockResolvedValue({ ...HANGOUT, discordMessageId: "m-1" });

    await expect(mod.refreshAnnouncement(ID)).resolves.toBe(true);

    const [channel, message, edited] = mod.editMessage.mock.calls[0];
    expect([channel, message]).toEqual(["chan-1", "m-1"]);
    const counts = edited.embeds[0].fields.filter((f: { name: string }) =>
      ["Going", "Maybe"].includes(f.name)
    );
    expect(counts.map((f: { value: string }) => f.value)).toEqual(["2", "1"]);
  });

  it("does nothing without a channel or an announced message, and never throws", async () => {
    const mod = await load();

    vi.stubEnv("DISCORD_HANGOUTS_CHANNEL_ID", "");
    await expect(mod.refreshAnnouncement(ID)).resolves.toBe(false);
    vi.stubEnv("DISCORD_HANGOUTS_CHANNEL_ID", "chan-1");

    mod.prisma.hangout.findUnique.mockResolvedValueOnce({ ...HANGOUT, discordMessageId: null });
    await expect(mod.refreshAnnouncement(ID)).resolves.toBe(false);
    mod.prisma.hangout.findUnique.mockRejectedValueOnce(new Error("db down"));
    await expect(mod.refreshAnnouncement(ID)).resolves.toBe(false);
    expect(mod.editMessage).not.toHaveBeenCalled();
  });
});
