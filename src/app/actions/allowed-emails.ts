"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

export type AllowedEmailResult = { error: string } | { success: true };

const ALREADY_LISTED = "That email is already on the list.";
const FORBIDDEN = "Forbidden: Admin access required";
const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .email("Enter a valid email address.");

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  return currentUser?.role === Role.ADMIN ? currentUser : null;
}

export async function addAllowedEmailAction(value: string): Promise<AllowedEmailResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: FORBIDDEN };

  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await prisma.allowedEmail.findUnique({ where: { email: parsed.data } });
  if (existing) return { error: ALREADY_LISTED };

  try {
    await prisma.allowedEmail.create({ data: { email: parsed.data, addedBy: admin.email } });
  } catch (error) {
    // a double click can pass the check above twice; the primary key still refuses the second
    if ((error as { code?: string }).code === "P2002") return { error: ALREADY_LISTED };
    throw error;
  }
  revalidatePath("/admin/members");
  return { success: true };
}

export async function removeAllowedEmailAction(value: string): Promise<AllowedEmailResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const joined = await prisma.user.findFirst({
    where: { email: { equals: parsed.data, mode: "insensitive" } },
    select: { id: true },
  });
  if (joined) return { error: "That person already has an account, so it can't be removed here." };

  await prisma.allowedEmail.deleteMany({ where: { email: parsed.data } });
  revalidatePath("/admin/members");
  return { success: true };
}
