"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type ProfileActionResult = { error: string } | { success: true };

// ─── Update display name ───────────────────────────────────────────────────────
const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or fewer"),
});

export async function updateProfileAction(
  values: z.infer<typeof profileSchema>
): Promise<ProfileActionResult> {
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await prisma.user.update({
    where: { id: user.id },
    data: { name: parsed.data.name },
  });

  revalidatePath("/settings/profile");
  return { success: true };
}

// ─── Upload avatar ─────────────────────────────────────────────────────────────
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export async function updateAvatarAction(formData: FormData): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (!ALLOWED_MIME.includes(file.type))
    return { error: "Only JPEG, PNG, WebP and GIF images are allowed" };
  if (file.size > MAX_BYTES) return { error: "File must be smaller than 5 MB" };

  const ext = file.name.split(".").pop() ?? "jpg";
  const path = `${user.id}/avatar.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  const cacheBustedAvatarUrl = `${publicUrl}?v=${Date.now()}`;

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: cacheBustedAvatarUrl },
  });

  revalidatePath("/settings/profile");
  return { success: true };
}
