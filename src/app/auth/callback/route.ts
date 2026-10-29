import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { CallbackErrorCode } from "@/lib/auth-errors";

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

const RESET_PATH = "/auth/reset-password";

/** Only same-site paths: "@evil.com" or "//evil.com" would otherwise send the user to another host. */
function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/dashboard";
}

function authErrorRedirect(origin: string, code: CallbackErrorCode, next: string): NextResponse {
  // an expired or used reset link goes back to the request page, everything else to sign-in
  const page = next === RESET_PATH ? "/auth/forgot-password" : "/auth/sign-in";
  return NextResponse.redirect(`${origin}${page}?error=${next === RESET_PATH ? "expired" : code}`);
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const next = safeNext(searchParams.get("next"));

  // `code` is the default PKCE link and only works in the browser that asked for it. A `token_hash` link
  // (used by the recovery email template) is verified here, so it also works when the email is opened on
  // another device.
  if (code || (tokenHash && searchParams.get("type") === "recovery")) {
    const supabase = await createClient();
    const { data, error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash! });

    if (!error && data.user) {
      const email = resolveAuthEmail(data.user);
      if (!email) {
        return authErrorRedirect(origin, "email", next);
      }

      const discordId =
        data.user.identities?.find((identity) => identity.provider === "discord")?.identity_data
          ?.sub ?? null;

      try {
        // Ensure the user row exists in our database
        await prisma.user.upsert({
          where: { id: data.user.id },
          update: discordId ? { discordId } : {},
          create: {
            id: data.user.id,
            email,
            discordId,
          },
        });
      } catch (upsertError) {
        console.error("Failed to sync callback user profile", upsertError);
        return authErrorRedirect(origin, "sync", next);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — send back to sign-in with an error
  return authErrorRedirect(origin, "confirm", next);
}
