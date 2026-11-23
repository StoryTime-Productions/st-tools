"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
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

function refresh() {
  revalidatePath("/bucket-list");
}

/**
 * Add an item (any member) or edit one (the suggester or an admin). New tags are admin-only, like on
 * boards: a member picks from the shared tags that already exist.
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
  if (fresh.length > 0 && user.role !== Role.ADMIN) {
    return { error: `Only admins can create tags: ${fresh.join(", ")}` };
  }

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

  await prisma.bucketItem.delete({ where: { id } });
  refresh();
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

  refresh();
  return { success: true };
}
