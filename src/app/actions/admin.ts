"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

export type AdminActionResult = { error: string } | { success: true };

const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.nativeEnum(Role),
});

export async function updateUserRoleAction(userId: string, role: Role): Promise<AdminActionResult> {
  // Authorise — only ADMINs may change roles
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== Role.ADMIN) {
    return { error: "Forbidden: Admin access required" };
  }

  const parsed = updateRoleSchema.safeParse({ userId, role });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { role: parsed.data.role },
  });

  revalidatePath("/admin/members");
  return { success: true };
}
