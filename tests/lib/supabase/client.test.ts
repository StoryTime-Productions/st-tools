import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => ({ __mock: true })),
}));

import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@/lib/supabase/client";

const ORIGINAL_ENV = process.env;
const mockedCreateBrowserClient = vi.mocked(createBrowserClient);

describe("createClient", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    mockedCreateBrowserClient.mockClear();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("creates browser client with public env values", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const client = createClient();

    expect(client).toEqual({ __mock: true });
    expect(mockedCreateBrowserClient).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key"
    );
  });

  it("throws when required public env values are missing", () => {
    expect(() => createClient()).toThrowError(
      "Missing Supabase browser configuration: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  });
});
