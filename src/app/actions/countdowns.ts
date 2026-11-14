"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import {
  MAX_COUNTDOWN_TITLE,
  MAX_PERSONAL_COUNTDOWNS,
  countPersonalCountdowns,
  expiryFor,
  normalizeTitle,
} from "@/lib/countdowns";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

export type CountdownActionResult = { error: string } | { success: true };

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string(),
  targetAt: z.string().datetime(),
  who: z.enum(["ONLY_ME", "EVERYONE", "CHOSEN"]),
  userIds: z.array(z.string().uuid()).max(200).default([]),
});

export type SaveCountdownInput = z.input<typeof saveSchema>;

const NOT_ALLOWED = "You can't change that countdown.";

async function requireUser() {
  const user = await getCurrentUser();
  return user ?? null;
}

function refresh() {
  revalidatePath("/dashboard");
}

/** Create or update a countdown. Members only make personal ones; admins can also make global ones. */
export async function saveCountdownAction(
  input: SaveCountdownInput
): Promise<CountdownActionResult> {
  const user = await requireUser();
  if (!user) return { error: "Sign in to manage countdowns." };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the title and date, then try again." };
  const { id, who, userIds } = parsed.data;

  const title = normalizeTitle(parsed.data.title);
  if (!title) return { error: "Give the countdown a title." };
  if (parsed.data.title.trim().length > MAX_COUNTDOWN_TITLE) {
    return { error: `Keep the title to ${MAX_COUNTDOWN_TITLE} characters or fewer.` };
  }

  const isAdmin = user.role === Role.ADMIN;
  if (who !== "ONLY_ME" && !isAdmin) return { error: NOT_ALLOWED };
  if (who === "CHOSEN" && userIds.length === 0) return { error: "Choose at least one person." };

  const scope = who === "ONLY_ME" ? "PERSONAL" : "GLOBAL";
  const targetAt = new Date(parsed.data.targetAt);
  const now = new Date();

  const existing = id
    ? await prisma.countdown.findUnique({
        where: { id },
        select: { ownerId: true, scope: true, targetAt: true },
      })
    : null;
  if (id) {
    if (!existing) return { error: "That countdown no longer exists." };
    const mayEdit = existing.scope === "GLOBAL" ? isAdmin : existing.ownerId === user.id;
    if (!mayEdit) return { error: NOT_ALLOWED };
  }

  const dateUnchanged = existing?.targetAt.getTime() === targetAt.getTime();
  if (targetAt.getTime() <= now.getTime() && !dateUnchanged) {
    return { error: "Pick a date and time in the future." };
  }

  if (scope === "PERSONAL" && existing?.scope !== "PERSONAL") {
    if ((await countPersonalCountdowns(user.id, now)) >= MAX_PERSONAL_COUNTDOWNS) {
      return {
        error: `You can keep ${MAX_PERSONAL_COUNTDOWNS} personal countdowns at a time. Delete one first.`,
      };
    }
  }

  const audience = scope === "GLOBAL" && who === "CHOSEN" ? [...new Set(userIds)] : [];
  const data = { title, targetAt, scope, expiresAt: expiryFor(scope, targetAt) } as const;

  if (id) {
    await prisma.$transaction([
      prisma.countdownAudience.deleteMany({ where: { countdownId: id } }),
      prisma.countdown.update({
        where: { id },
        data: {
          ...data,
          ...(dateUnchanged ? {} : { dismissals: { deleteMany: {} } }),
          audience: { create: audience.map((userId) => ({ userId })) },
        },
      }),
    ]);
  } else {
    await prisma.countdown.create({
      data: {
        ...data,
        ownerId: user.id,
        audience: { create: audience.map((userId) => ({ userId })) },
      },
    });
  }

  refresh();
  return { success: true };
}

export async function deleteCountdownAction(id: string): Promise<CountdownActionResult> {
  const user = await requireUser();
  if (!user) return { error: "Sign in to manage countdowns." };
  if (!z.string().uuid().safeParse(id).success)
    return { error: "That countdown no longer exists." };

  const existing = await prisma.countdown.findUnique({
    where: { id },
    select: { ownerId: true, scope: true },
  });
  if (!existing) return { error: "That countdown no longer exists." };
  const mayDelete =
    existing.scope === "GLOBAL" ? user.role === Role.ADMIN : existing.ownerId === user.id;
  if (!mayDelete) return { error: NOT_ALLOWED };

  await prisma.countdown.delete({ where: { id } });
  refresh();
  return { success: true };
}

/** Acknowledge a fired alarm for this user only, so it stays quiet on every other tab and device. */
export async function dismissCountdownAction(id: string): Promise<CountdownActionResult> {
  const user = await requireUser();
  if (!user) return { error: "Sign in to manage countdowns." };
  if (!z.string().uuid().safeParse(id).success)
    return { error: "That countdown no longer exists." };

  const visible = await prisma.countdown.findFirst({
    where: {
      id,
      OR: [
        { scope: "PERSONAL", ownerId: user.id },
        { scope: "GLOBAL", audience: { none: {} } },
        { scope: "GLOBAL", audience: { some: { userId: user.id } } },
      ],
    },
    select: { id: true },
  });
  if (!visible) return { error: "That countdown no longer exists." };

  await prisma.countdownDismissal.upsert({
    where: { countdownId_userId: { countdownId: id, userId: user.id } },
    create: { countdownId: id, userId: user.id },
    update: { dismissedAt: new Date() },
  });
  return { success: true };
}
