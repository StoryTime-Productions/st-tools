import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const THREAD = "https://discord.com/channels/123/456";
const admin = { id: "33333333-3333-4333-8333-333333333333", role: "ADMIN" };
const member = { id: "44444444-4444-4444-8444-444444444444", role: "MEMBER" };

async function loadModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(admin);
  const prisma = {
    hangout: {
      create: vi.fn().mockResolvedValue({ id: HANGOUT_ID }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const uploadCover = vi.fn();
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/cover-upload", () => ({ uploadCover }));
  const actions = await import("@/app/actions/hangouts");
  return { ...actions, revalidatePath, getCurrentUser, prisma, uploadCover };
}

describe("hangout actions", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("creates a hangout and revalidates the hub", async () => {
    const mod = await loadModule();

    await expect(
      mod.createHangoutAction({ title: "  Beach day ", description: "", discordThreadUrl: THREAD })
    ).resolves.toEqual({ success: true, hangoutId: HANGOUT_ID });
    expect(mod.prisma.hangout.create).toHaveBeenCalledWith({
      data: { title: "Beach day", description: null, discordThreadUrl: THREAD },
      select: { id: true },
    });
    expect(mod.revalidatePath).toHaveBeenCalledWith("/hub");
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);
  });

  it("rejects bad input and non-admins", async () => {
    const mod = await loadModule();

    await expect(
      mod.createHangoutAction({ title: " ", description: null, discordThreadUrl: null })
    ).resolves.toEqual({ error: "Title is required" });
    await expect(
      mod.createHangoutAction({
        title: "Beach",
        description: null,
        discordThreadUrl: "https://example.com/x",
      })
    ).resolves.toEqual({ error: "Thread link must be a discord.com/channels/... link" });

    mod.getCurrentUser.mockResolvedValue(member);
    const forbidden = { error: "Forbidden: Admin access required" };
    await expect(
      mod.createHangoutAction({ title: "Beach", description: null, discordThreadUrl: null })
    ).resolves.toEqual(forbidden);
    await expect(
      mod.updateHangoutAction({
        hangoutId: HANGOUT_ID,
        title: "Beach",
        description: null,
        discordThreadUrl: null,
      })
    ).resolves.toEqual(forbidden);
    await expect(mod.cancelHangoutAction(HANGOUT_ID)).resolves.toEqual(forbidden);
    await expect(mod.setHangoutCoverUrlAction(HANGOUT_ID, null)).resolves.toEqual(forbidden);
    await expect(mod.uploadHangoutCoverAction(new FormData())).resolves.toEqual(forbidden);
    expect(mod.prisma.hangout.create).not.toHaveBeenCalled();
    expect(mod.prisma.hangout.updateMany).not.toHaveBeenCalled();
  });

  it("updates and cancels a hangout", async () => {
    const mod = await loadModule();

    await expect(
      mod.updateHangoutAction({
        hangoutId: HANGOUT_ID,
        title: "Beach day",
        description: " Bring sunscreen ",
        discordThreadUrl: "https://ptb.discord.com/channels/1/2/3",
      })
    ).resolves.toEqual({ success: true });
    expect(mod.prisma.hangout.updateMany).toHaveBeenCalledWith({
      where: { id: HANGOUT_ID },
      data: {
        title: "Beach day",
        description: "Bring sunscreen",
        discordThreadUrl: "https://ptb.discord.com/channels/1/2/3",
      },
    });

    await expect(mod.cancelHangoutAction(HANGOUT_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangout.updateMany).toHaveBeenLastCalledWith({
      where: { id: HANGOUT_ID },
      data: { status: "CANCELLED" },
    });
    await expect(mod.cancelHangoutAction("bad")).resolves.toHaveProperty("error");

    mod.prisma.hangout.updateMany.mockResolvedValue({ count: 0 });
    const missing = { error: "Hangout not found" };
    await expect(mod.cancelHangoutAction(HANGOUT_ID)).resolves.toEqual(missing);
    await expect(
      mod.updateHangoutAction({
        hangoutId: HANGOUT_ID,
        title: "Beach",
        description: null,
        discordThreadUrl: null,
      })
    ).resolves.toEqual(missing);
    await expect(
      mod.updateHangoutAction({
        hangoutId: "bad",
        title: "Beach",
        description: null,
        discordThreadUrl: null,
      })
    ).resolves.toHaveProperty("error");
  });

  it("sets, clears and uploads the cover", async () => {
    const mod = await loadModule();

    await expect(
      mod.setHangoutCoverUrlAction(HANGOUT_ID, "https://example.com/c.png")
    ).resolves.toEqual({ success: true });
    expect(mod.prisma.hangout.updateMany).toHaveBeenLastCalledWith({
      where: { id: HANGOUT_ID },
      data: { coverImageUrl: "https://example.com/c.png" },
    });
    await expect(mod.setHangoutCoverUrlAction(HANGOUT_ID, "ftp://x")).resolves.toHaveProperty(
      "error"
    );

    const form = new FormData();
    form.set("hangoutId", "bad");
    await expect(mod.uploadHangoutCoverAction(form)).resolves.toEqual({
      error: "Invalid hangout",
    });

    form.set("hangoutId", HANGOUT_ID);
    mod.uploadCover.mockResolvedValueOnce({ error: "No file provided" });
    await expect(mod.uploadHangoutCoverAction(form)).resolves.toEqual({
      error: "No file provided",
    });

    mod.uploadCover.mockResolvedValueOnce({ url: "https://cdn/c.png?v=1" });
    await expect(mod.uploadHangoutCoverAction(form)).resolves.toEqual({ success: true });
    expect(mod.uploadCover).toHaveBeenLastCalledWith(
      null,
      `${admin.id}/hangout-covers/${HANGOUT_ID}`
    );
    expect(mod.prisma.hangout.updateMany).toHaveBeenLastCalledWith({
      where: { id: HANGOUT_ID },
      data: { coverImageUrl: "https://cdn/c.png?v=1" },
    });

    mod.prisma.hangout.updateMany.mockResolvedValue({ count: 0 });
    await expect(mod.setHangoutCoverUrlAction(HANGOUT_ID, null)).resolves.toEqual({
      error: "Hangout not found",
    });
  });
});
