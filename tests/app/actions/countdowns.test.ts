import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CD = "33333333-3333-4333-8333-333333333333";
const FUTURE = new Date(Date.now() + 7 * 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

async function load(user: unknown = { id: ME, role: "MEMBER" }) {
  vi.resetModules();
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  const prisma = {
    countdown: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue({ id: CD }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn((args: { data: Record<string, unknown> }) => args),
      delete: vi.fn().mockResolvedValue({}),
    },
    countdownAudience: { deleteMany: vi.fn((args: unknown) => args) },
    countdownDismissal: { upsert: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  const countPersonalCountdowns = vi.fn().mockResolvedValue(0);
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  const real = await vi.importActual<typeof import("@/lib/countdowns")>("@/lib/countdowns");
  vi.doMock("@/lib/countdowns", () => ({ ...real, countPersonalCountdowns }));
  return {
    ...(await import("@/app/actions/countdowns")),
    prisma,
    revalidatePath,
    countPersonalCountdowns,
  };
}

const admin = { id: ME, role: "ADMIN" };
const personal = { title: "Trip", targetAt: FUTURE, who: "ONLY_ME" as const };

describe("saveCountdownAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("needs a signed-in user", async () => {
    const { saveCountdownAction } = await load(null);
    expect(await saveCountdownAction(personal)).toEqual({ error: "Sign in to manage countdowns." });
  });

  it("rejects malformed input, empty and over-long titles", async () => {
    const { saveCountdownAction } = await load();
    expect(await saveCountdownAction({ ...personal, targetAt: "tomorrow" })).toEqual({
      error: "Check the title and date, then try again.",
    });
    expect(await saveCountdownAction({ ...personal, title: "   " })).toEqual({
      error: "Give the countdown a title.",
    });
    expect(await saveCountdownAction({ ...personal, title: "x".repeat(61) })).toEqual({
      error: "Keep the title to 60 characters or fewer.",
    });
  });

  it("lets members make only personal countdowns", async () => {
    const { saveCountdownAction } = await load();
    expect(await saveCountdownAction({ ...personal, who: "EVERYONE" })).toEqual({
      error: "You can't change that countdown.",
    });
  });

  it("requires at least one person for a chosen audience", async () => {
    const { saveCountdownAction } = await load(admin);
    expect(await saveCountdownAction({ ...personal, who: "CHOSEN" })).toEqual({
      error: "Choose at least one person.",
    });
  });

  it("rejects a past date on create", async () => {
    const { saveCountdownAction } = await load();
    expect(await saveCountdownAction({ ...personal, targetAt: PAST })).toEqual({
      error: "Pick a date and time in the future.",
    });
  });

  it("creates a personal countdown that expires 24 h after it fires", async () => {
    const { saveCountdownAction, prisma, revalidatePath } = await load();
    expect(await saveCountdownAction({ ...personal, title: "  Big   trip " })).toEqual({
      success: true,
    });
    const data = prisma.countdown.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ title: "Big trip", scope: "PERSONAL", ownerId: ME });
    expect(data.expiresAt.getTime()).toBe(new Date(FUTURE).getTime() + 86_400_000);
    expect(data.audience).toEqual({ create: [] });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("stops a member at 10 personal countdowns", async () => {
    const { saveCountdownAction, countPersonalCountdowns, prisma } = await load();
    countPersonalCountdowns.mockResolvedValue(10);
    expect(await saveCountdownAction(personal)).toEqual({
      error: "You can keep 10 personal countdowns at a time. Delete one first.",
    });
    expect(prisma.countdown.create).not.toHaveBeenCalled();
  });

  it("lets an admin create a global countdown for everyone, with no expiry", async () => {
    const { saveCountdownAction, prisma } = await load(admin);
    await saveCountdownAction({ ...personal, who: "EVERYONE", userIds: [OTHER] });
    const data = prisma.countdown.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ scope: "GLOBAL", expiresAt: null });
    expect(data.audience).toEqual({ create: [] });
  });

  it("stores a chosen audience once per person", async () => {
    const { saveCountdownAction, prisma } = await load(admin);
    await saveCountdownAction({ ...personal, who: "CHOSEN", userIds: [OTHER, OTHER, ME] });
    expect(prisma.countdown.create.mock.calls[0][0].data.audience).toEqual({
      create: [{ userId: OTHER }, { userId: ME }],
    });
  });

  it("fails when the countdown being edited is gone", async () => {
    const { saveCountdownAction } = await load();
    expect(await saveCountdownAction({ ...personal, id: CD })).toEqual({
      error: "That countdown no longer exists.",
    });
  });

  it("only lets the owner edit a personal countdown and only admins edit global ones", async () => {
    const { saveCountdownAction, prisma } = await load();
    prisma.countdown.findUnique.mockResolvedValue({
      ownerId: OTHER,
      scope: "PERSONAL",
      targetAt: new Date(FUTURE),
    });
    expect(await saveCountdownAction({ ...personal, id: CD })).toEqual({
      error: "You can't change that countdown.",
    });
    prisma.countdown.findUnique.mockResolvedValue({
      ownerId: ME,
      scope: "GLOBAL",
      targetAt: new Date(FUTURE),
    });
    expect(await saveCountdownAction({ ...personal, id: CD })).toEqual({
      error: "You can't change that countdown.",
    });
  });

  it("updates in one transaction and clears dismissals when the date moves", async () => {
    const { saveCountdownAction, prisma } = await load();
    prisma.countdown.findUnique.mockResolvedValue({
      ownerId: ME,
      scope: "PERSONAL",
      targetAt: new Date(Date.now() + 1000),
    });
    expect(await saveCountdownAction({ ...personal, id: CD })).toEqual({ success: true });
    expect(prisma.countdownAudience.deleteMany).toHaveBeenCalledWith({
      where: { countdownId: CD },
    });
    expect(prisma.countdown.update.mock.calls[0][0].data.dismissals).toEqual({ deleteMany: {} });
    expect(prisma.countdown.create).not.toHaveBeenCalled();
  });

  it("replaces a global countdown's audience on edit", async () => {
    const { saveCountdownAction, prisma } = await load(admin);
    prisma.countdown.findUnique.mockResolvedValue({
      ownerId: ME,
      scope: "GLOBAL",
      targetAt: new Date(FUTURE),
    });
    await saveCountdownAction({ ...personal, id: CD, who: "CHOSEN", userIds: [OTHER] });
    expect(prisma.countdown.update.mock.calls[0][0].data.audience).toEqual({
      create: [{ userId: OTHER }],
    });
  });

  it("keeps dismissals and allows an already-passed date when it is unchanged", async () => {
    const { saveCountdownAction, prisma, countPersonalCountdowns } = await load();
    prisma.countdown.findUnique.mockResolvedValue({
      ownerId: ME,
      scope: "PERSONAL",
      targetAt: new Date(PAST),
    });
    expect(await saveCountdownAction({ ...personal, id: CD, targetAt: PAST })).toEqual({
      success: true,
    });
    expect(prisma.countdown.update.mock.calls[0][0].data.dismissals).toBeUndefined();
    expect(countPersonalCountdowns).not.toHaveBeenCalled();
  });

  it("counts toward the cap when an admin turns a global countdown personal", async () => {
    const { saveCountdownAction, prisma, countPersonalCountdowns } = await load(admin);
    prisma.countdown.findUnique.mockResolvedValue({
      ownerId: ME,
      scope: "GLOBAL",
      targetAt: new Date(FUTURE),
    });
    countPersonalCountdowns.mockResolvedValue(10);
    expect(await saveCountdownAction({ ...personal, id: CD })).toEqual({
      error: "You can keep 10 personal countdowns at a time. Delete one first.",
    });
  });
});

describe("deleteCountdownAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("needs a user, a real id and an existing countdown", async () => {
    expect(await (await load(null)).deleteCountdownAction(CD)).toEqual({
      error: "Sign in to manage countdowns.",
    });
    const { deleteCountdownAction } = await load();
    expect(await deleteCountdownAction("nope")).toEqual({
      error: "That countdown no longer exists.",
    });
    expect(await deleteCountdownAction(CD)).toEqual({ error: "That countdown no longer exists." });
  });

  it("lets the owner delete a personal countdown but not someone else's", async () => {
    const { deleteCountdownAction, prisma, revalidatePath } = await load();
    prisma.countdown.findUnique.mockResolvedValue({ ownerId: ME, scope: "PERSONAL" });
    expect(await deleteCountdownAction(CD)).toEqual({ success: true });
    expect(prisma.countdown.delete).toHaveBeenCalledWith({ where: { id: CD } });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    prisma.countdown.findUnique.mockResolvedValue({ ownerId: OTHER, scope: "PERSONAL" });
    expect(await deleteCountdownAction(CD)).toEqual({ error: "You can't change that countdown." });
  });

  it("lets only admins delete a global countdown", async () => {
    const member = await load();
    member.prisma.countdown.findUnique.mockResolvedValue({ ownerId: ME, scope: "GLOBAL" });
    expect(await member.deleteCountdownAction(CD)).toEqual({
      error: "You can't change that countdown.",
    });
    const adm = await load(admin);
    adm.prisma.countdown.findUnique.mockResolvedValue({ ownerId: OTHER, scope: "GLOBAL" });
    expect(await adm.deleteCountdownAction(CD)).toEqual({ success: true });
  });
});

describe("dismissCountdownAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("needs a user, a real id and a countdown this user can see", async () => {
    expect(await (await load(null)).dismissCountdownAction(CD)).toEqual({
      error: "Sign in to manage countdowns.",
    });
    const { dismissCountdownAction, prisma } = await load();
    expect(await dismissCountdownAction("nope")).toEqual({
      error: "That countdown no longer exists.",
    });
    prisma.countdown.findFirst.mockResolvedValue(null);
    expect(await dismissCountdownAction(CD)).toEqual({ error: "That countdown no longer exists." });
  });

  it("records the dismissal for this user only", async () => {
    const { dismissCountdownAction, prisma } = await load();
    expect(await dismissCountdownAction(CD)).toEqual({ success: true });
    expect(JSON.stringify(prisma.countdown.findFirst.mock.calls[0][0].where)).toContain(
      `"audience":{"some":{"userId":"${ME}"}}`
    );
    expect(prisma.countdownDismissal.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { countdownId_userId: { countdownId: CD, userId: ME } },
        create: { countdownId: CD, userId: ME },
      })
    );
  });
});
