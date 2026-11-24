import { beforeEach, describe, expect, it, vi } from "vitest";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

async function load(user: unknown = { id: ME, role: "MEMBER" }) {
  vi.resetModules();
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn().mockResolvedValue(user);
  const tx = {
    tag: { createMany: vi.fn().mockResolvedValue({}) },
    bucketItem: {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    bucketItem: {
      findUnique: vi.fn().mockResolvedValue({ suggestedById: ME, status: "TODO", hangoutId: null }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    tag: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
  };
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  return { ...(await import("@/app/actions/bucket-list")), prisma, tx, revalidatePath };
}

describe("saveBucketItemAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a signed-in user", async () => {
    const { saveBucketItemAction } = await load(null);
    expect(await saveBucketItemAction({ title: "x" })).toEqual({
      error: "Sign in to use the bucket list.",
    });
  });

  it("reports the first schema problem", async () => {
    const { saveBucketItemAction } = await load();
    expect(await saveBucketItemAction({ title: "x", tags: Array(13).fill("a") })).toEqual({
      error: "Use 12 tags or fewer",
    });
    expect(await saveBucketItemAction({ id: "nope", title: "x" })).toMatchObject({
      error: expect.any(String),
    });
  });

  it("passes the field rules through", async () => {
    const { saveBucketItemAction } = await load();
    expect(await saveBucketItemAction({ title: "  " })).toEqual({ error: "Give it a title." });
    expect(await saveBucketItemAction({ title: "x", seasonYear: 2027 })).toEqual({
      error: "Pick a season to go with the year.",
    });
  });

  it("lets any member add an item, suggested by them, linked to existing tags", async () => {
    const { saveBucketItemAction, prisma, tx, revalidatePath } = await load();
    prisma.tag.findMany.mockResolvedValue([{ name: "outdoors" }]);
    expect(
      await saveBucketItemAction({
        title: " Camping ",
        notes: "tent",
        season: "SUMMER",
        seasonYear: 2027,
        tags: ["outdoors", "outdoors"],
      })
    ).toEqual({ success: true });
    expect(tx.tag.createMany).not.toHaveBeenCalled();
    expect(tx.bucketItem.create).toHaveBeenCalledWith({
      data: {
        title: "Camping",
        notes: "tent",
        season: "SUMMER",
        seasonYear: 2027,
        suggestedById: ME,
        tags: { connect: [{ name: "outdoors" }] },
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/bucket-list");
  });

  it("lets any member type new tags, creating only the ones that do not exist yet", async () => {
    const { saveBucketItemAction, prisma, tx } = await load();
    prisma.tag.findMany.mockResolvedValue([{ name: "outdoors" }]);
    expect(
      await saveBucketItemAction({ title: "x", tags: ["brand-new", "outdoors", "other"] })
    ).toEqual({ success: true });
    expect(tx.tag.createMany).toHaveBeenCalledWith({
      data: [{ name: "brand-new" }, { name: "other" }],
      skipDuplicates: true,
    });
    expect(tx.bucketItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tags: { connect: [{ name: "brand-new" }, { name: "outdoors" }, { name: "other" }] },
      }),
    });
  });

  it("lets the suggester edit and replaces the tag set", async () => {
    const { saveBucketItemAction, tx } = await load();
    expect(await saveBucketItemAction({ id: ITEM, title: "Renamed" })).toEqual({ success: true });
    expect(tx.bucketItem.update).toHaveBeenCalledWith({
      where: { id: ITEM },
      data: {
        title: "Renamed",
        notes: null,
        season: null,
        seasonYear: null,
        tags: { set: [] },
      },
    });
    expect(tx.bucketItem.create).not.toHaveBeenCalled();
  });

  it("lets an admin edit someone else's item", async () => {
    const { saveBucketItemAction, prisma, tx } = await load({ id: OTHER, role: "ADMIN" });
    prisma.bucketItem.findUnique.mockResolvedValue({ suggestedById: ME });
    expect(await saveBucketItemAction({ id: ITEM, title: "Renamed" })).toEqual({ success: true });
    expect(tx.bucketItem.update).toHaveBeenCalled();
  });

  it("refuses another member's edit", async () => {
    const { saveBucketItemAction, prisma, tx } = await load({ id: OTHER, role: "MEMBER" });
    prisma.bucketItem.findUnique.mockResolvedValue({ suggestedById: ME });
    expect(await saveBucketItemAction({ id: ITEM, title: "Renamed" })).toEqual({
      error: "You can only change items you suggested.",
    });
    expect(tx.bucketItem.update).not.toHaveBeenCalled();
  });

  it("reports an item that is gone", async () => {
    const { saveBucketItemAction, prisma } = await load();
    prisma.bucketItem.findUnique.mockResolvedValue(null);
    expect(await saveBucketItemAction({ id: ITEM, title: "x" })).toEqual({
      error: "That item no longer exists.",
    });
  });
});

describe("deleteBucketItemAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a signed-in user and a real id", async () => {
    expect(await (await load(null)).deleteBucketItemAction(ITEM)).toEqual({
      error: "Sign in to use the bucket list.",
    });
    expect(await (await load()).deleteBucketItemAction("nope")).toEqual({
      error: "That item no longer exists.",
    });
  });

  it("lets the suggester delete", async () => {
    const { deleteBucketItemAction, prisma, revalidatePath } = await load();
    expect(await deleteBucketItemAction(ITEM)).toEqual({ success: true });
    expect(prisma.bucketItem.delete).toHaveBeenCalledWith({ where: { id: ITEM } });
    expect(revalidatePath).toHaveBeenCalledWith("/bucket-list");
  });

  it("lets an admin delete, refuses another member, reports a missing item", async () => {
    const admin = await load({ id: OTHER, role: "ADMIN" });
    admin.prisma.bucketItem.findUnique.mockResolvedValue({ suggestedById: ME });
    expect(await admin.deleteBucketItemAction(ITEM)).toEqual({ success: true });

    const member = await load({ id: OTHER, role: "MEMBER" });
    member.prisma.bucketItem.findUnique.mockResolvedValue({ suggestedById: ME });
    expect(await member.deleteBucketItemAction(ITEM)).toEqual({
      error: "You can only change items you suggested.",
    });
    expect(member.prisma.bucketItem.delete).not.toHaveBeenCalled();

    const gone = await load();
    gone.prisma.bucketItem.findUnique.mockResolvedValue(null);
    expect(await gone.deleteBucketItemAction(ITEM)).toEqual({
      error: "That item no longer exists.",
    });
  });
});

describe("setBucketItemDoneAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("needs a signed-in user, a real id and an existing item", async () => {
    expect(await (await load(null)).setBucketItemDoneAction(ITEM, true)).toEqual({
      error: "Sign in to use the bucket list.",
    });
    expect(await (await load()).setBucketItemDoneAction("nope", true)).toEqual({
      error: "That item no longer exists.",
    });
    const gone = await load();
    gone.prisma.bucketItem.findUnique.mockResolvedValue(null);
    expect(await gone.setBucketItemDoneAction(ITEM, true)).toEqual({
      error: "That item no longer exists.",
    });
  });

  it("lets any member tick Done, not only the suggester", async () => {
    const { setBucketItemDoneAction, prisma } = await load({ id: OTHER, role: "MEMBER" });
    expect(await setBucketItemDoneAction(ITEM, true)).toEqual({ success: true });
    expect(prisma.bucketItem.update).toHaveBeenCalledWith({
      where: { id: ITEM },
      data: { status: "DONE", doneAt: expect.any(Date) },
    });
  });

  it("unticks back to In plan with a hangout, To do without", async () => {
    const withHangout = await load();
    withHangout.prisma.bucketItem.findUnique.mockResolvedValue({ status: "DONE", hangoutId: "h1" });
    await withHangout.setBucketItemDoneAction(ITEM, false);
    expect(withHangout.prisma.bucketItem.update).toHaveBeenCalledWith({
      where: { id: ITEM },
      data: { status: "IN_PLAN", doneAt: null },
    });

    const without = await load();
    without.prisma.bucketItem.findUnique.mockResolvedValue({ status: "DONE", hangoutId: null });
    await without.setBucketItemDoneAction(ITEM, false);
    expect(without.prisma.bucketItem.update).toHaveBeenCalledWith({
      where: { id: ITEM },
      data: { status: "TODO", doneAt: null },
    });
  });

  it("does nothing when the item is already in the asked state", async () => {
    const { setBucketItemDoneAction, prisma, revalidatePath } = await load();
    prisma.bucketItem.findUnique.mockResolvedValue({ status: "DONE", hangoutId: null });
    expect(await setBucketItemDoneAction(ITEM, true)).toEqual({ success: true });
    expect(prisma.bucketItem.update).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalled();
  });
});
