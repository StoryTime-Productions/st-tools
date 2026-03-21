"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export type ProfileActionResult = { error: string } | { success: true };

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024;
const DEFAULT_BACKGROUND_IMAGE_OPACITY = 45;
const DEFAULT_BACKGROUND_IMAGE_STYLE = "STRETCH" as const;
const DEFAULT_BACKGROUND_PATTERN_SCALE = 100;

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

// ─── Update appearance ────────────────────────────────────────────────────────
const appearanceSchema = z
  .object({
    primaryColor: z.string().regex(HEX_COLOR_PATTERN, "Primary color must be a valid hex color"),
    secondaryColor: z
      .string()
      .regex(HEX_COLOR_PATTERN, "Secondary color must be a valid hex color"),
    backgroundMode: z.enum(["NONE", "COLOR", "IMAGE"]),
    backgroundImageStyle: z.enum(["STRETCH", "PATTERN"]),
    backgroundPatternScale: z
      .number()
      .int("Pattern scale must be a whole number")
      .min(10, "Pattern scale must be at least 10")
      .max(300, "Pattern scale must be 300 or less"),
    backgroundColor: z
      .string()
      .regex(HEX_COLOR_PATTERN, "Background color must be a valid hex color")
      .nullable(),
    backgroundImageOpacity: z
      .number()
      .int("Background opacity must be a whole number")
      .min(0, "Background opacity must be at least 0")
      .max(100, "Background opacity must be 100 or less"),
  })
  .superRefine((values, ctx) => {
    if (values.backgroundMode === "COLOR" && !values.backgroundColor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["backgroundColor"],
        message: "Background color must be a valid hex color",
      });
    }
  });

function normalizeHexColor(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const prefixed = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

  if (!HEX_COLOR_PATTERN.test(prefixed)) {
    return null;
  }

  if (prefixed.length === 4) {
    return `#${prefixed[1]}${prefixed[1]}${prefixed[2]}${prefixed[2]}${prefixed[3]}${prefixed[3]}`.toLowerCase();
  }

  return prefixed.toLowerCase();
}

function getFileExtension(fileName: string, fallback: string) {
  const extension = fileName.split(".").pop();
  return extension && extension.length > 0 ? extension.toLowerCase() : fallback;
}

function coerceBackgroundOpacity(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BACKGROUND_IMAGE_OPACITY;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function coerceBackgroundPatternScale(value: FormDataEntryValue | null): number {
  if (typeof value !== "string") {
    return DEFAULT_BACKGROUND_PATTERN_SCALE;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_BACKGROUND_PATTERN_SCALE;
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_BACKGROUND_PATTERN_SCALE;
  }

  return Math.max(10, Math.min(300, Math.round(parsed)));
}

export async function updateAppearanceAction(formData: FormData): Promise<ProfileActionResult> {
  if (!(formData instanceof FormData)) {
    return { error: "Invalid appearance payload." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const primaryColor = normalizeHexColor(
    typeof formData.get("primaryColor") === "string"
      ? (formData.get("primaryColor") as string)
      : null
  );
  const secondaryColor = normalizeHexColor(
    typeof formData.get("secondaryColor") === "string"
      ? (formData.get("secondaryColor") as string)
      : null
  );

  const modeRaw = formData.get("backgroundMode");
  const backgroundMode =
    modeRaw === "NONE" || modeRaw === "COLOR" || modeRaw === "IMAGE" ? modeRaw : null;

  const backgroundImageStyleRaw = formData.get("backgroundImageStyle");
  const backgroundImageStyle =
    backgroundImageStyleRaw === "STRETCH" || backgroundImageStyleRaw === "PATTERN"
      ? backgroundImageStyleRaw
      : DEFAULT_BACKGROUND_IMAGE_STYLE;

  const backgroundColor = normalizeHexColor(
    typeof formData.get("backgroundColor") === "string"
      ? (formData.get("backgroundColor") as string)
      : null
  );

  const backgroundImageOpacity = coerceBackgroundOpacity(formData.get("backgroundImageOpacity"));
  const backgroundPatternScale = coerceBackgroundPatternScale(
    formData.get("backgroundPatternScale")
  );

  const parsed = appearanceSchema.safeParse({
    primaryColor,
    secondaryColor,
    backgroundMode,
    backgroundImageStyle,
    backgroundPatternScale,
    backgroundColor,
    backgroundImageOpacity,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { backgroundImageUrl: true },
  });

  let nextBackgroundImageUrl = currentUser?.backgroundImageUrl ?? null;

  const removeBackgroundImage = formData.get("removeBackgroundImage") === "true";
  if (removeBackgroundImage) {
    nextBackgroundImageUrl = null;
  }

  const backgroundFile = formData.get("backgroundImage");
  if (backgroundFile instanceof File && backgroundFile.size > 0) {
    if (!ALLOWED_IMAGE_MIME.includes(backgroundFile.type)) {
      return { error: "Only JPEG, PNG, WebP and GIF images are allowed" };
    }

    if (backgroundFile.size > MAX_BACKGROUND_BYTES) {
      return { error: "Background image must be smaller than 8 MB" };
    }

    const ext = getFileExtension(backgroundFile.name, "jpg");
    const path = `${user.id}/background.${ext}`;
    const bytes = await backgroundFile.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, bytes, { contentType: backgroundFile.type, upsert: true });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("avatars").getPublicUrl(path);

    nextBackgroundImageUrl = `${publicUrl}?v=${Date.now()}`;
  }

  if (parsed.data.backgroundMode === "IMAGE" && !nextBackgroundImageUrl) {
    return { error: "Please upload a background image or switch to a different background mode" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      primaryColor: parsed.data.primaryColor,
      secondaryColor: parsed.data.secondaryColor,
      backgroundMode: parsed.data.backgroundMode,
      backgroundImageStyle: parsed.data.backgroundImageStyle,
      backgroundPatternScale: parsed.data.backgroundPatternScale,
      backgroundColor: parsed.data.backgroundMode === "COLOR" ? parsed.data.backgroundColor : null,
      backgroundImageUrl:
        parsed.data.backgroundMode === "IMAGE"
          ? nextBackgroundImageUrl
          : parsed.data.backgroundMode === "NONE"
            ? null
            : (currentUser?.backgroundImageUrl ?? null),
      backgroundImageOpacity: parsed.data.backgroundImageOpacity,
    },
  });

  revalidatePath("/settings/profile");
  revalidatePath("/dashboard");
  revalidatePath("/boards");
  revalidatePath("/admin/members");

  return { success: true };
}

// ─── Upload avatar ─────────────────────────────────────────────────────────────
export async function updateAvatarAction(formData: FormData): Promise<ProfileActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const file = formData.get("avatar") as File | null;
  if (!file || file.size === 0) return { error: "No file provided" };
  if (!ALLOWED_IMAGE_MIME.includes(file.type))
    return { error: "Only JPEG, PNG, WebP and GIF images are allowed" };
  if (file.size > MAX_AVATAR_BYTES) return { error: "File must be smaller than 5 MB" };

  const ext = getFileExtension(file.name, "jpg");
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
