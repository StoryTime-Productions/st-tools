import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getSupabaseConfig } from "@/lib/supabase/env";

const ORIGINAL_ENV = process.env;

describe("getSupabaseConfig", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("uses NEXT_PUBLIC values when provided", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    expect(getSupabaseConfig()).toEqual({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    });
  });

  it("falls back to server-side aliases", () => {
    process.env.SUPABASE_URL = "https://fallback.supabase.co";
    process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-key";

    expect(getSupabaseConfig()).toEqual({
      url: "https://fallback.supabase.co",
      anonKey: "publishable-key",
    });
  });

  it("throws with clear list of missing env vars", () => {
    expect(() => getSupabaseConfig()).toThrowError(
      "Missing Supabase environment configuration: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL), NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY)."
    );
  });
});
