"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

async function resolveSiteOrigin(): Promise<string> {
  const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;
  if (configuredOrigin) {
    return trimTrailingSlash(configuredOrigin);
  }

  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (host) {
    const proto =
      headerStore.get("x-forwarded-proto") ??
      (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${proto}://${host}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return "http://localhost:3000";
}

function resolveAuthEmail(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string | null {
  const metadataEmail =
    typeof user.user_metadata?.email === "string" ? user.user_metadata.email : null;
  const candidate = user.email ?? metadataEmail;
  if (!candidate) {
    return null;
  }
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : null;
}

const signUpSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthActionResult = { error: string } | { success: true } | { confirmEmail: true };

export async function signUpAction(
  values: z.infer<typeof signUpSchema>
): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const origin = await resolveSiteOrigin();

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  // Supabase requires email confirmation — session will be null until confirmed.
  // The /auth/callback route handles the prisma upsert after the user clicks the link.
  if (!data.session) {
    return { confirmEmail: true };
  }

  // Email confirmation is disabled on this project — session is immediately available.
  if (data.user) {
    const email = resolveAuthEmail(data.user);
    if (!email) {
      return { error: "Could not determine an email for this account." };
    }

    try {
      await prisma.user.upsert({
        where: { id: data.user.id },
        update: {},
        create: {
          id: data.user.id,
          email,
        },
      });
    } catch (upsertError) {
      console.error("Failed to sync sign-up user profile", upsertError);
      return { error: "Could not sync your account profile." };
    }
  }

  redirect("/dashboard");
}

export async function signInWithGoogleAction(): Promise<AuthActionResult> {
  const supabase = await createClient();
  const origin = await resolveSiteOrigin();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  redirect(data.url!);
}

export async function signInAction(
  values: z.infer<typeof signInSchema>
): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse(values);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: error.message };

  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/sign-in");
}
