"use server";

import { revalidateHangoutPage } from "@/lib/hangout-live";
import { z } from "zod";
import { HangoutStatus, Role } from "@prisma/client";
import { resplitCosts } from "@/lib/cost-shares";
import { getCurrentUser } from "@/lib/get-current-user";
import { money, queueUpdate } from "@/lib/hangout-updates";
import { prisma } from "@/lib/prisma";

export type CostActionResult = { error: string } | { success: true };

const FORBIDDEN = "Forbidden: Admin access required";
const NOT_FOUND = "Hangout not found";
const CLOSED = "This hangout is cancelled";

const costSchema = z.object({
  title: z.string().trim().min(1, "Item name is required").max(120, "Item name is too long"),
  amountCents: z
    .number()
    .int()
    .min(1, "Amount must be above $0")
    .max(10_000_000, "Amount is too large"),
  collectorId: z.string().uuid("Pick who collects"),
  /** Who the item is split between (G1); empty is allowed (G10). */
  participantIds: z
    .array(z.string().uuid("Participant not found"))
    .max(200, "Too many participants")
    .transform((ids) => [...new Set(ids)]),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes are too long")
    .nullable()
    .transform((value) => value || null),
});

type CostValues = z.input<typeof costSchema>;

async function isAdmin() {
  return (await getCurrentUser())?.role === Role.ADMIN;
}

async function settle(hangoutId: string): Promise<CostActionResult> {
  await resplitCosts(hangoutId);
  revalidateHangoutPage(hangoutId);
  return { success: true };
}

async function collectorExists(id: string) {
  return Boolean(await prisma.user.findUnique({ where: { id }, select: { id: true } }));
}

async function usersExist(ids: string[]) {
  return (
    ids.length === 0 || (await prisma.user.count({ where: { id: { in: ids } } })) === ids.length
  );
}

export async function addCostAction(
  hangoutId: string,
  values: CostValues
): Promise<CostActionResult> {
  if (!(await isAdmin())) return { error: FORBIDDEN };
  if (!z.string().uuid().safeParse(hangoutId).success) return { error: NOT_FOUND };
  const parsed = costSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const hangout = await prisma.hangout.findUnique({
    where: { id: hangoutId },
    select: { status: true, _count: { select: { costs: true } } },
  });
  if (!hangout) return { error: NOT_FOUND };
  if (hangout.status === HangoutStatus.CANCELLED) return { error: CLOSED };
  if (!(await collectorExists(parsed.data.collectorId))) return { error: "Collector not found" };
  const { participantIds, ...fields } = parsed.data;
  if (!(await usersExist(participantIds))) return { error: "Participant not found" };

  await prisma.hangoutCost.create({
    data: {
      ...fields,
      hangoutId,
      position: hangout._count.costs,
      participants: { create: participantIds.map((userId) => ({ userId })) },
    },
  });
  await queueUpdate(
    hangoutId,
    "Costs",
    "—",
    `${parsed.data.title} ${money(parsed.data.amountCents)}`
  );
  return settle(hangoutId);
}

/** The item with its hangout, or why the caller can't change it. */
async function editableCost(costId: string) {
  if (!(await isAdmin())) return { error: FORBIDDEN } as const;
  if (!z.string().uuid().safeParse(costId).success) return { error: "Cost not found" } as const;
  const cost = await prisma.hangoutCost.findUnique({
    where: { id: costId },
    select: {
      hangoutId: true,
      title: true,
      amountCents: true,
      hangout: { select: { status: true } },
    },
  });
  if (!cost) return { error: "Cost not found" } as const;
  if (cost.hangout.status === HangoutStatus.CANCELLED) return { error: CLOSED } as const;
  return { cost };
}

export async function updateCostAction(
  costId: string,
  values: CostValues
): Promise<CostActionResult> {
  const parsed = costSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const found = await editableCost(costId);
  if (!found.cost) return { error: found.error };
  if (!(await collectorExists(parsed.data.collectorId))) return { error: "Collector not found" };
  const { participantIds, ...fields } = parsed.data;
  if (!(await usersExist(participantIds))) return { error: "Participant not found" };

  // G7: someone who already paid can only leave the group after they are refunded.
  const current = await prisma.hangoutCostParticipant.findMany({
    where: { costId },
    select: { userId: true },
  });
  const removed = current.map(({ userId }) => userId).filter((id) => !participantIds.includes(id));
  if (removed.length > 0) {
    const paid = await prisma.hangoutCostShare.findFirst({
      where: {
        costId,
        userId: { in: removed, not: fields.collectorId },
        OR: [{ paidCents: { gt: 0 } }, { status: { in: ["SENT", "CONFIRMED"] } }],
      },
      select: { user: { select: { name: true, email: true } } },
    });
    if (paid)
      return {
        error: `${paid.user.name ?? paid.user.email} has paid; mark them refunded before removing them`,
      };
  }

  await prisma.$transaction([
    prisma.hangoutCost.update({ where: { id: costId }, data: fields }),
    prisma.hangoutCostParticipant.deleteMany({
      where: { costId, userId: { notIn: participantIds } },
    }),
    prisma.hangoutCostParticipant.createMany({
      data: participantIds.map((userId) => ({ costId, userId })),
      skipDuplicates: true,
    }),
  ]);
  const { cost } = found;
  await queueUpdate(
    cost.hangoutId,
    "Costs",
    `${cost.title} ${money(cost.amountCents)}`,
    `${parsed.data.title} ${money(parsed.data.amountCents)}`
  );
  return settle(found.cost.hangoutId);
}

export async function deleteCostAction(costId: string): Promise<CostActionResult> {
  const found = await editableCost(costId);
  if (!found.cost) return { error: found.error };

  await prisma.hangoutCost.delete({ where: { id: costId } });
  await queueUpdate(found.cost.hangoutId, "Costs", found.cost.title, "removed");
  return settle(found.cost.hangoutId);
}
