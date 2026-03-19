import { createBrowserClient } from "@supabase/ssr";

function readPublicEnv(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value : undefined;
}

export function createClient() {
  const url = readPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = readPublicEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !anonKey) {
    const missing = [
      !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
      !anonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
    ]
      .filter(Boolean)
      .join(", ");

    throw new Error(`Missing Supabase browser configuration: ${missing}.`);
  }

  return createBrowserClient(url, anonKey);
}
