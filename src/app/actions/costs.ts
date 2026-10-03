"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HangoutStatus, Role } from "@prisma/client";
import { resplitCosts } from "@/lib/cost-shares";
import { getCurrentUser } from "@/lib/get-current-user";
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
  revalidatePath(`/hub/hangouts/${hangoutId}`);
  return { success: true };
}

async function collectorExists(id: string) {
  return Boolean(await prisma.user.findUnique({ where: { id }, select: { id: true } }));
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

  await prisma.hangoutCost.create({
    data: { ...parsed.data, hangoutId, position: hangout._count.costs },
  });
  return settle(hangoutId);
}

/** The item with its hangout, or why the caller can't change it. */
async function editableCost(costId: string) {
  if (!(await isAdmin())) return { error: FORBIDDEN } as const;
  if (!z.string().uuid().safeParse(costId).success) return { error: "Cost not found" } as const;
  const cost = await prisma.hangoutCost.findUnique({
    where: { id: costId },
    select: { hangoutId: true, hangout: { select: { status: true } } },
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

  await prisma.hangoutCost.update({ where: { id: costId }, data: parsed.data });
  return settle(found.cost.hangoutId);
}

export async function deleteCostAction(costId: string): Promise<CostActionResult> {
  const found = await editableCost(costId);
  if (!found.cost) return { error: found.error };

  await prisma.hangoutCost.delete({ where: { id: costId } });
  return settle(found.cost.hangoutId);
}
