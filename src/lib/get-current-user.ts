import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

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

/**
 * Returns the Prisma `User` row for the currently authenticated Supabase
 * session, or `null` if the user is not signed in.
 *
 * If the user is authenticated but has no DB row yet (e.g. signed up before
 * the auth callback upsert was in place) the row is created on the fly.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const email = resolveAuthEmail(user);
  if (!email) return null;

  return prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      email,
      name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatarUrl: user.user_metadata?.avatar_url ?? null,
    },
  });
}
