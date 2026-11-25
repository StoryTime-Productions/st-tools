"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManageItem, parseBucketInput } from "@/lib/bucket-list-core";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

export type BucketActionResult = { error: string } | { success: true };

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  notes: z.string().nullish(),
  season: z.string().nullish(),
  seasonYear: z.number().nullish(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12, "Use 12 tags or fewer").default([]),
});

export type SaveBucketItemInput = z.input<typeof saveSchema>;

const idSchema = z.string().uuid();

const NOT_ALLOWED = "You can only change items you suggested.";

function refresh(hangoutId?: string | null) {
  revalidatePath("/bucket-list");
  if (hangoutId) revalidatePath(`/hub/hangouts/${hangoutId}`);
}

/**
 * Add an item (any member) or edit one (the suggester or an admin). Tags are free text: any member
 * can type a new one, and it joins the shared tag table.
 */
export async function saveBucketItemAction(
  input: SaveBucketItemInput
): Promise<BucketActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to use the bucket list." };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues.map((issue) => issue.message).join(" ") };

  const fields = parseBucketInput(parsed.data);
  if (!fields.ok) return { error: fields.error };

  if (parsed.data.id) {
    const existing = await prisma.bucketItem.findUnique({
      where: { id: parsed.data.id },
      select: { suggestedById: true },
    });
    if (!existing) return { error: "That item no longer exists." };
    if (!canManageItem(existing, user)) return { error: NOT_ALLOWED };
  }

  const tags = Array.from(new Set(parsed.data.tags));
  const known = await prisma.tag.findMany({
    where: { name: { in: tags } },
    select: { name: true },
  });
  const fresh = tags.filter((name) => !known.some((tag) => tag.name === name));

  const { title, notes, season, seasonYear } = fields.value;
  await prisma.$transaction(async (tx) => {
    if (fresh.length > 0) {
      await tx.tag.createMany({ data: fresh.map((name) => ({ name })), skipDuplicates: true });
    }
    const tagLinks = tags.map((name) => ({ name }));
    if (parsed.data.id) {
      await tx.bucketItem.update({
        where: { id: parsed.data.id },
        data: { title, notes, season, seasonYear, tags: { set: tagLinks } },
      });
    } else {
      await tx.bucketItem.create({
        data: {
          title,
          notes,
          season,
          seasonYear,
          suggestedById: user.id,
          tags: { connect: tagLinks },
        },
      });
    }
  });

  refresh();
  return { success: true };
}

export async function deleteBucketItemAction(id: string): Promise<BucketActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to use the bucket list." };
  if (!idSchema.safeParse(id).success) return { error: "That item no longer exists." };

  const existing = await prisma.bucketItem.findUnique({
    where: { id },
    select: { suggestedById: true },
  });
  if (!existing) return { error: "That item no longer exists." };
  if (!canManageItem(existing, user)) return { error: NOT_ALLOWED };

  const removed = await prisma.bucketItem.delete({ where: { id }, select: { hangoutId: true } });
  refresh(removed.hangoutId);
  return { success: true };
}

/**
 * Tick or untick Done; any member can. Unticking puts the item back In plan when it still has a
 * hangout, otherwise To do.
 */
export async function setBucketItemDoneAction(
  id: string,
  done: boolean
): Promise<BucketActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to use the bucket list." };
  if (!idSchema.safeParse(id).success) return { error: "That item no longer exists." };

  const existing = await prisma.bucketItem.findUnique({
    where: { id },
    select: { status: true, hangoutId: true },
  });
  if (!existing) return { error: "That item no longer exists." };

  const isDone = existing.status === "DONE";
  if (done !== isDone) {
    await prisma.bucketItem.update({
      where: { id },
      data: done
        ? { status: "DONE", doneAt: new Date() }
        : { status: existing.hangoutId ? "IN_PLAN" : "TODO", doneAt: null },
    });
  }

  refresh(existing.hangoutId);
  return { success: true };
}

/**
 * Move an item between To do and In plan; any member can. A Done item stays Done (untick it first).
 */
export async function setBucketItemPlannedAction(
  id: string,
  planned: boolean
): Promise<BucketActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to use the bucket list." };
  if (!idSchema.safeParse(id).success) return { error: "That item no longer exists." };

  const existing = await prisma.bucketItem.findUnique({
    where: { id },
    select: { status: true, hangoutId: true },
  });
  if (!existing) return { error: "That item no longer exists." };
  if (existing.status === "DONE") return { error: "Untick Done first." };

  await prisma.bucketItem.update({
    where: { id },
    data: { status: planned ? "IN_PLAN" : "TODO" },
  });
  refresh(existing.hangoutId);
  return { success: true };
}

/**
 * Link an item to a hangout, or unlink it with `hangoutId` null; any member can. Linking moves a
 * To do item to In plan; unlinking leaves the status alone (In plan can exist without a hangout).
 */
export async function linkBucketItemHangoutAction(
  id: string,
  hangoutId: string | null
): Promise<BucketActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to use the bucket list." };
  if (!idSchema.safeParse(id).success) return { error: "That item no longer exists." };
  if (hangoutId !== null && !idSchema.safeParse(hangoutId).success) {
    return { error: "That hangout no longer exists." };
  }

  const existing = await prisma.bucketItem.findUnique({
    where: { id },
    select: { status: true, hangoutId: true },
  });
  if (!existing) return { error: "That item no longer exists." };

  if (hangoutId !== null) {
    const hangout = await prisma.hangout.findUnique({
      where: { id: hangoutId },
      select: { status: true, bucketItem: { select: { id: true } } },
    });
    if (!hangout || hangout.status === "CANCELLED") {
      return { error: "That hangout no longer exists." };
    }
    if (hangout.bucketItem && hangout.bucketItem.id !== id) {
      return { error: "That hangout already has a bucket-list item." };
    }
  }

  await prisma.bucketItem.update({
    where: { id },
    data: {
      hangoutId,
      ...(hangoutId !== null && existing.status === "TODO" ? { status: "IN_PLAN" as const } : {}),
    },
  });
  refresh(existing.hangoutId);
  refresh(hangoutId);
  return { success: true };
}
