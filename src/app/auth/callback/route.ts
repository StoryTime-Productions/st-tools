import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

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

function authErrorRedirect(origin: string, message: string): NextResponse {
  return NextResponse.redirect(`${origin}/auth/sign-in?error=${encodeURIComponent(message)}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const email = resolveAuthEmail(data.user);
      if (!email) {
        return authErrorRedirect(origin, "Could not determine an email for this account.");
      }

      try {
        // Ensure the user row exists in our database
        await prisma.user.upsert({
          where: { id: data.user.id },
          update: {},
          create: {
            id: data.user.id,
            email,
          },
        });
      } catch (upsertError) {
        console.error("Failed to sync callback user profile", upsertError);
        return authErrorRedirect(origin, "Could not sync your account profile.");
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to sign-in with an error
  return authErrorRedirect(origin, "Could not confirm your account.");
}
