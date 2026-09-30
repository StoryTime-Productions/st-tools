import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "22222222-2222-4222-8222-222222222222";
const IDEA_ID = "55555555-5555-4555-8555-555555555555";
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
      findUnique: vi.fn().mockResolvedValue({
        status: "COLLECTING",
        availabilityDates: ["2026-10-03"],
        windowStartHour: 10,
        windowEndHour: 11,
      }),
    },
    hangoutAvailability: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      upsert: vi.fn(),
    },
    hangoutAttendee: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    hangoutIdea: {
      findFirst: vi.fn().mockResolvedValue({ title: "Karaoke", details: "Friday?" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
    fn(prisma)
  );
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

  it("promotes an idea into a hangout once", async () => {
    const mod = await loadModule();

    await expect(mod.promoteIdeaAction(IDEA_ID)).resolves.toEqual({
      success: true,
      hangoutId: HANGOUT_ID,
    });
    expect(mod.prisma.hangout.create).toHaveBeenCalledWith({
      data: { title: "Karaoke", description: "Friday?" },
      select: { id: true },
    });
    expect(mod.prisma.hangoutIdea.updateMany).toHaveBeenCalledWith({
      where: { id: IDEA_ID, hangoutId: null },
      data: { hangoutId: HANGOUT_ID },
    });
    expect(mod.revalidatePath).toHaveBeenCalledWith("/hub/ideas");

    const gone = { error: "Idea not found or already promoted" };
    mod.prisma.hangoutIdea.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(mod.promoteIdeaAction(IDEA_ID)).resolves.toEqual(gone);
    mod.prisma.hangoutIdea.findFirst.mockResolvedValueOnce(null);
    await expect(mod.promoteIdeaAction(IDEA_ID)).resolves.toEqual(gone);
    await expect(mod.promoteIdeaAction("bad")).resolves.toHaveProperty("error");

    mod.prisma.$transaction.mockRejectedValueOnce(new Error("db down"));
    await expect(mod.promoteIdeaAction(IDEA_ID)).rejects.toThrow("db down");

    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.promoteIdeaAction(IDEA_ID)).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("dismisses only unpromoted ideas and only for admins", async () => {
    const mod = await loadModule();

    await expect(mod.dismissIdeaAction(IDEA_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutIdea.deleteMany).toHaveBeenCalledWith({
      where: { id: IDEA_ID, hangoutId: null },
    });

    mod.prisma.hangoutIdea.deleteMany.mockResolvedValueOnce({ count: 0 });
    await expect(mod.dismissIdeaAction(IDEA_ID)).resolves.toEqual({
      error: "Idea not found or already promoted",
    });
    await expect(mod.dismissIdeaAction("bad")).resolves.toHaveProperty("error");

    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.dismissIdeaAction(IDEA_ID)).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("saves the availability setup with a deduplicated, sorted date list", async () => {
    const mod = await loadModule();
    const setup = {
      hangoutId: HANGOUT_ID,
      dates: ["2026-10-04", "2026-10-03", "2026-10-04"],
      startHour: 10,
      endHour: 18,
      deadline: "2026-10-02T18:00",
    };

    await expect(mod.setAvailabilitySetupAction(setup)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangout.updateMany).toHaveBeenCalledWith({
      where: { id: HANGOUT_ID, status: "COLLECTING" },
      data: {
        availabilityDates: ["2026-10-03", "2026-10-04"],
        windowStartHour: 10,
        windowEndHour: 18,
        availabilityDeadline: new Date("2026-10-02T22:00:00Z"),
      },
    });

    await mod.setAvailabilitySetupAction({ ...setup, deadline: null });
    expect(mod.prisma.hangout.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ availabilityDeadline: null }),
      })
    );

    const invalid: Array<[typeof setup, string]> = [
      [{ ...setup, dates: [] }, "Pick at least one date"],
      [{ ...setup, dates: ["2026-13-45"] }, "Invalid date"],
      [{ ...setup, dates: ["Oct 3"] }, "Dates must look like 2026-10-03"],
      [{ ...setup, startHour: 18, endHour: 18 }, "End time must be after the start time"],
      [{ ...setup, deadline: "2026-10-02" }, "Deadline needs a date and time"],
    ];
    for (const [values, error] of invalid) {
      await expect(mod.setAvailabilitySetupAction(values)).resolves.toEqual({ error });
    }

    mod.prisma.hangout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(mod.setAvailabilitySetupAction(setup)).resolves.toEqual({
      error: "Hangout not found or no longer collecting availability",
    });

    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.setAvailabilitySetupAction(setup)).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });

  it("asks before a narrower setup drops answers, then trims them", async () => {
    const mod = await loadModule();
    const setup = {
      hangoutId: HANGOUT_ID,
      dates: ["2026-10-03"],
      startHour: 10,
      endHour: 11,
      deadline: null,
    };
    mod.prisma.hangoutAvailability.findMany.mockResolvedValue([
      { userId: member.id, slots: ["2026-10-03T10:00", "2026-10-04T10:00"] },
      { userId: admin.id, slots: ["2026-10-03T11:00"] },
      { userId: "kept", slots: ["2026-10-03T10:45"] },
    ]);

    await expect(mod.setAvailabilitySetupAction(setup)).resolves.toEqual({ confirmDrop: 2 });
    expect(mod.prisma.hangout.updateMany).not.toHaveBeenCalled();

    await expect(mod.setAvailabilitySetupAction(setup, true)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutAvailability.update).toHaveBeenCalledWith({
      where: { hangoutId_userId: { hangoutId: HANGOUT_ID, userId: member.id } },
      data: { slots: ["2026-10-03T10:00"] },
    });
    expect(mod.prisma.hangoutAvailability.delete).toHaveBeenCalledWith({
      where: { hangoutId_userId: { hangoutId: HANGOUT_ID, userId: admin.id } },
    });
    expect(mod.prisma.hangoutAvailability.update).toHaveBeenCalledTimes(1);

    mod.prisma.hangout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(mod.setAvailabilitySetupAction(setup, true)).resolves.toEqual({
      error: "Hangout not found or no longer collecting availability",
    });
    expect(mod.prisma.hangoutAvailability.delete).toHaveBeenCalledTimes(1);
  });

  it("saves a member's own slots inside the setup", async () => {
    const mod = await loadModule();
    mod.getCurrentUser.mockResolvedValue(member);
    const where = { hangoutId: HANGOUT_ID, userId: member.id };

    await expect(
      mod.saveAvailabilityAction({
        hangoutId: HANGOUT_ID,
        slots: ["2026-10-03T10:30", "2026-10-03T10:00", "2026-10-03T10:30", "2026-10-03T11:00"],
      })
    ).resolves.toEqual({ success: true });
    expect(mod.prisma.hangoutAvailability.upsert).toHaveBeenCalledWith({
      where: { hangoutId_userId: where },
      create: { ...where, slots: ["2026-10-03T10:00", "2026-10-03T10:30"] },
      update: { slots: ["2026-10-03T10:00", "2026-10-03T10:30"] },
    });
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);

    await mod.saveAvailabilityAction({ hangoutId: HANGOUT_ID, slots: ["2026-10-05T10:00"] });
    expect(mod.prisma.hangoutAvailability.deleteMany).toHaveBeenCalledWith({ where });

    mod.prisma.hangout.findUnique.mockResolvedValueOnce({ status: "SCHEDULED" });
    await expect(mod.saveAvailabilityAction({ hangoutId: HANGOUT_ID, slots: [] })).resolves.toEqual(
      { error: "Hangout not found or no longer collecting availability" }
    );
    await expect(mod.saveAvailabilityAction({ hangoutId: "nope", slots: [] })).resolves.toEqual({
      error: "Invalid availability",
    });

    mod.getCurrentUser.mockResolvedValue(null);
    await expect(mod.saveAvailabilityAction({ hangoutId: HANGOUT_ID, slots: [] })).resolves.toEqual(
      { error: "Unauthorized" }
    );
  });

  it("locks in a top option and seeds Going / Maybe", async () => {
    const mod = await loadModule();
    mod.prisma.hangout.findUnique.mockResolvedValue({
      status: "COLLECTING",
      availabilityDates: ["2026-10-03"],
      windowStartHour: 10,
      windowEndHour: 11,
      availability: [
        { userId: admin.id, slots: ["2026-10-03T10:00", "2026-10-03T10:15"] },
        { userId: member.id, slots: ["2026-10-03T10:15"] },
      ],
    });

    await expect(
      mod.lockInHangoutAction({ hangoutId: HANGOUT_ID, slot: "2026-10-03T10:00" })
    ).resolves.toEqual({ success: true });
    expect(mod.prisma.hangout.updateMany).toHaveBeenCalledWith({
      where: { id: HANGOUT_ID, status: "COLLECTING" },
      data: { status: "SCHEDULED", startSlot: "2026-10-03T10:00" },
    });
    expect(mod.prisma.hangoutAttendee.createMany).toHaveBeenCalledWith({
      data: [
        { hangoutId: HANGOUT_ID, userId: admin.id, status: "GOING" },
        { hangoutId: HANGOUT_ID, userId: member.id, status: "MAYBE" },
      ],
    });
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);

    await expect(
      mod.lockInHangoutAction({ hangoutId: HANGOUT_ID, slot: "2026-10-03T10:30" })
    ).resolves.toEqual({ error: "That time is no longer a top option" });

    mod.prisma.hangout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      mod.lockInHangoutAction({ hangoutId: HANGOUT_ID, slot: "2026-10-03T10:15" })
    ).resolves.toEqual({ error: "Hangout not found or no longer collecting availability" });

    mod.prisma.hangout.findUnique.mockResolvedValue({ status: "SCHEDULED" });
    await expect(
      mod.lockInHangoutAction({ hangoutId: HANGOUT_ID, slot: "2026-10-03T10:00" })
    ).resolves.toEqual({ error: "Hangout not found or no longer collecting availability" });
    await expect(mod.lockInHangoutAction({ hangoutId: HANGOUT_ID, slot: "soon" })).resolves.toEqual(
      { error: "Invalid time" }
    );

    mod.getCurrentUser.mockResolvedValue(member);
    await expect(
      mod.lockInHangoutAction({ hangoutId: HANGOUT_ID, slot: "2026-10-03T10:00" })
    ).resolves.toEqual({ error: "Forbidden: Admin access required" });
  });

  it("reopens a scheduled hangout and clears attendance", async () => {
    const mod = await loadModule();

    await expect(mod.reopenAvailabilityAction(HANGOUT_ID)).resolves.toEqual({ success: true });
    expect(mod.prisma.hangout.updateMany).toHaveBeenCalledWith({
      where: { id: HANGOUT_ID, status: "SCHEDULED" },
      data: { status: "COLLECTING", startSlot: null },
    });
    expect(mod.prisma.hangoutAttendee.deleteMany).toHaveBeenCalledWith({
      where: { hangoutId: HANGOUT_ID },
    });

    mod.prisma.hangout.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(mod.reopenAvailabilityAction(HANGOUT_ID)).resolves.toEqual({
      error: "Hangout not found or not scheduled",
    });
    await expect(mod.reopenAvailabilityAction("nope")).resolves.toHaveProperty("error");

    mod.getCurrentUser.mockResolvedValue(member);
    await expect(mod.reopenAvailabilityAction(HANGOUT_ID)).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
  });
});
