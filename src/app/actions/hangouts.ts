"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { HangoutStatus, Role } from "@prisma/client";
import { uploadCover } from "@/lib/cover-upload";
import { getCurrentUser } from "@/lib/get-current-user";
import { prisma } from "@/lib/prisma";

export type HangoutActionResult = { error: string } | { success: true };
export type CreateHangoutResult = { error: string } | { success: true; hangoutId: string };

const FORBIDDEN = "Forbidden: Admin access required";
const NOT_FOUND = "Hangout not found";

const hangoutDetailsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title is too long"),
  description: z.string().trim().max(5000, "Description is too long").nullable(),
  discordThreadUrl: z
    .string()
    .trim()
    .regex(
      /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/channels\/\d+\/\d+/,
      "Thread link must be a discord.com/channels/... link"
    )
    .nullable(),
});

const updateHangoutSchema = hangoutDetailsSchema.extend({ hangoutId: z.string().uuid() });

async function requireAdmin() {
  const currentUser = await getCurrentUser();
  return currentUser?.role === Role.ADMIN ? currentUser : null;
}

function revalidateHangout(hangoutId: string) {
  revalidatePath("/hub");
  revalidatePath(`/hub/hangouts/${hangoutId}`);
}

export async function createHangoutAction(
  values: z.infer<typeof hangoutDetailsSchema>
): Promise<CreateHangoutResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = hangoutDetailsSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const hangout = await prisma.hangout.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      discordThreadUrl: parsed.data.discordThreadUrl || null,
    },
    select: { id: true },
  });

  revalidateHangout(hangout.id);
  return { success: true, hangoutId: hangout.id };
}

export async function updateHangoutAction(
  values: z.infer<typeof updateHangoutSchema>
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = updateHangoutSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.hangout.updateMany({
    where: { id: parsed.data.hangoutId },
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      discordThreadUrl: parsed.data.discordThreadUrl || null,
    },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(parsed.data.hangoutId);
  return { success: true };
}

export async function cancelHangoutAction(hangoutId: string): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z.string().uuid().safeParse(hangoutId);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await prisma.hangout.updateMany({
    where: { id: parsed.data },
    data: { status: HangoutStatus.CANCELLED },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(parsed.data);
  return { success: true };
}

async function saveHangoutCover(hangoutId: string, coverImageUrl: string | null) {
  const result = await prisma.hangout.updateMany({
    where: { id: hangoutId },
    data: { coverImageUrl },
  });
  if (result.count === 0) return { error: NOT_FOUND };

  revalidateHangout(hangoutId);
  return { success: true } as const;
}

export async function setHangoutCoverUrlAction(
  hangoutId: string,
  url: string | null
): Promise<HangoutActionResult> {
  if (!(await requireAdmin())) return { error: FORBIDDEN };

  const parsed = z
    .object({
      hangoutId: z.string().uuid(),
      url: z
        .string()
        .trim()
        .url("Enter a full image URL")
        .refine((value) => /^https?:\/\//i.test(value), "Image URLs must start with http(s)://")
        .nullable(),
    })
    .safeParse({ hangoutId, url });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  return saveHangoutCover(parsed.data.hangoutId, parsed.data.url);
}

export async function uploadHangoutCoverAction(formData: FormData): Promise<HangoutActionResult> {
  const admin = await requireAdmin();
  if (!admin) return { error: FORBIDDEN };

  const hangoutId = z.string().uuid().safeParse(formData.get("hangoutId"));
  if (!hangoutId.success) return { error: "Invalid hangout" };

  const cover = await uploadCover(
    formData.get("cover"),
    `${admin.id}/hangout-covers/${hangoutId.data}`
  );
  if ("error" in cover) return cover;

  return saveHangoutCover(hangoutId.data, cover.url);
}
