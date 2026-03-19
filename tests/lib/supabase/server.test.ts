import { beforeEach, describe, expect, it, vi } from "vitest";

type ServerClientOptions = {
  cookies: {
    getAll: () => unknown;
    setAll: (
      cookiesToSet: Array<{
        name: string;
        value: string;
        options?: Record<string, unknown>;
      }>
    ) => void;
  };
};

describe("createClient (server)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates server client with cookie accessors", async () => {
    const createServerClient = vi.fn(
      (url: string, anonKey: string, options: ServerClientOptions) => {
        void url;
        void anonKey;
        void options;
        return { client: true };
      }
    );
    const getSupabaseConfig = vi.fn(() => ({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    }));

    const cookieStore = {
      getAll: vi.fn(() => [{ name: "sb", value: "token" }]),
      set: vi.fn(),
    };
    const cookies = vi.fn().mockResolvedValue(cookieStore);

    vi.doMock("@supabase/ssr", () => ({ createServerClient }));
    vi.doMock("next/headers", () => ({ cookies }));
    vi.doMock("@/lib/supabase/env", () => ({ getSupabaseConfig }));

    const { createClient } = await import("@/lib/supabase/server");

    const result = await createClient();

    expect(result).toEqual({ client: true });
    expect(getSupabaseConfig).toHaveBeenCalledTimes(1);
    expect(createServerClient).toHaveBeenCalledTimes(1);

    const firstCall = createServerClient.mock.calls[0];
    const options = firstCall[2];

    expect(options.cookies.getAll()).toEqual([{ name: "sb", value: "token" }]);
    expect(cookieStore.getAll).toHaveBeenCalledTimes(1);

    options.cookies.setAll([
      {
        name: "sb-refresh-token",
        value: "refresh-token",
        options: { path: "/", httpOnly: true },
      },
    ]);

    expect(cookieStore.set).toHaveBeenCalledWith("sb-refresh-token", "refresh-token", {
      path: "/",
      httpOnly: true,
    });
  });

  it("swallows cookie set errors from server component contexts", async () => {
    const createServerClient = vi.fn(
      (url: string, anonKey: string, options: ServerClientOptions) => {
        void url;
        void anonKey;
        void options;
        return { client: true };
      }
    );
    const getSupabaseConfig = vi.fn(() => ({
      url: "https://example.supabase.co",
      anonKey: "anon-key",
    }));

    const cookieStore = {
      getAll: vi.fn(() => []),
      set: vi.fn(() => {
        throw new Error("read-only cookies");
      }),
    };
    const cookies = vi.fn().mockResolvedValue(cookieStore);

    vi.doMock("@supabase/ssr", () => ({ createServerClient }));
    vi.doMock("next/headers", () => ({ cookies }));
    vi.doMock("@/lib/supabase/env", () => ({ getSupabaseConfig }));

    const { createClient } = await import("@/lib/supabase/server");

    await createClient();

    const firstCall = createServerClient.mock.calls[0];
    const options = firstCall[2];

    expect(() => {
      options.cookies.setAll([
        {
          name: "sb-refresh-token",
          value: "refresh-token",
          options: { path: "/" },
        },
      ]);
    }).not.toThrow();
  });
});
