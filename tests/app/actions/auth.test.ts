import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

function buildSupabaseClient() {
  return {
    auth: {
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  };
}

async function loadAuthModule() {
  const headers = vi.fn();
  const redirect = vi.fn();
  const createClient = vi.fn();
  const upsert = vi.fn();

  vi.doMock("next/headers", () => ({ headers }));
  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient }));
  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      user: {
        upsert,
      },
    },
  }));

  const authModule = await import("@/app/actions/auth");

  return {
    ...authModule,
    headers,
    redirect,
    createClient,
    upsert,
  };
}

describe("auth actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com";
    delete process.env.SITE_URL;
    delete process.env.VERCEL_URL;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("validates sign-up payload", async () => {
    const { signUpAction } = await loadAuthModule();

    const result = await signUpAction({
      email: "not-an-email",
      password: "short",
      confirmPassword: "different",
    });

    expect(result).toEqual({ error: "Invalid email address" });
  });

  it("returns confirmEmail when sign-up has no session", async () => {
    const { signUpAction, createClient } = await loadAuthModule();
    const supabase = buildSupabaseClient();

    supabase.auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    createClient.mockResolvedValue(supabase);

    const result = await signUpAction({
      email: "new@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result).toEqual({ confirmEmail: true });
  });

  it("uses forwarded headers for callback origin when site env is missing", async () => {
    const { signUpAction, createClient, headers } = await loadAuthModule();
    const supabase = buildSupabaseClient();

    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;

    headers.mockResolvedValue({
      get: (key: string) => {
        if (key === "x-forwarded-host") {
          return "preview.example.com";
        }

        if (key === "x-forwarded-proto") {
          return "http";
        }

        return null;
      },
    });

    supabase.auth.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: "Sign-up failed" },
    });
    createClient.mockResolvedValue(supabase);

    const result = await signUpAction({
      email: "new@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result).toEqual({ error: "Sign-up failed" });
    expect(supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo: "http://preview.example.com/auth/callback",
        }),
      })
    );
  });

  it("falls back to VERCEL_URL for oauth redirect origin", async () => {
    const { signInWithGoogleAction, createClient, headers } = await loadAuthModule();
    const supabase = buildSupabaseClient();

    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
    process.env.VERCEL_URL = "st-tools-preview.vercel.app";

    headers.mockResolvedValue({
      get: () => null,
    });

    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "OAuth unavailable" },
    });
    createClient.mockResolvedValue(supabase);

    const result = await signInWithGoogleAction();

    expect(result).toEqual({ error: "OAuth unavailable" });
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "https://st-tools-preview.vercel.app/auth/callback",
        }),
      })
    );
  });

  it("falls back to localhost origin when no env or host headers are set", async () => {
    const { signInWithGoogleAction, createClient, headers } = await loadAuthModule();
    const supabase = buildSupabaseClient();

    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
    delete process.env.VERCEL_URL;

    headers.mockResolvedValue({
      get: () => null,
    });

    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "Provider unavailable" },
    });
    createClient.mockResolvedValue(supabase);

    const result = await signInWithGoogleAction();

    expect(result).toEqual({ error: "Provider unavailable" });
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: "http://localhost:3000/auth/callback",
        }),
      })
    );
  });

  it("upserts user and redirects on immediate sign-up session", async () => {
    const { signUpAction, createClient, upsert, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();

    supabase.auth.signUp.mockResolvedValue({
      data: {
        session: { access_token: "token" },
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "owner@example.com",
          user_metadata: {},
        },
      },
      error: null,
    });
    createClient.mockResolvedValue(supabase);

    await signUpAction({
      email: "owner@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    expect(upsert).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("returns a profile email error when immediate sign-up user has no email", async () => {
    const { signUpAction, createClient, upsert, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();

    supabase.auth.signUp.mockResolvedValue({
      data: {
        session: { access_token: "token" },
        user: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          email: null,
          user_metadata: {},
        },
      },
      error: null,
    });
    createClient.mockResolvedValue(supabase);

    const result = await signUpAction({
      email: "owner@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result).toEqual({ error: "Could not determine an email for this account." });
    expect(upsert).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns sync error when immediate sign-up upsert fails", async () => {
    const { signUpAction, createClient, upsert, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    supabase.auth.signUp.mockResolvedValue({
      data: {
        session: { access_token: "token" },
        user: {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          email: "owner@example.com",
          user_metadata: {},
        },
      },
      error: null,
    });
    upsert.mockRejectedValueOnce(new Error("db down"));
    createClient.mockResolvedValue(supabase);

    const result = await signUpAction({
      email: "owner@example.com",
      password: "password123",
      confirmPassword: "password123",
    });

    expect(result).toEqual({ error: "Could not sync your account profile." });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "Failed to sync sign-up user profile",
      expect.any(Error)
    );
    expect(redirect).not.toHaveBeenCalled();
  });

  it("returns sign-in errors and redirects when successful", async () => {
    const { signInAction, createClient, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);

    await expect(signInAction({ email: "user@example.com", password: "short" })).resolves.toEqual({
      error: "Password must be at least 8 characters",
    });

    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials" },
    });

    await expect(
      signInAction({ email: "user@example.com", password: "password123" })
    ).resolves.toEqual({ error: "Invalid login credentials" });

    supabase.auth.signInWithPassword.mockResolvedValueOnce({ error: null });

    await signInAction({ email: "user@example.com", password: "password123" });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("starts google oauth and redirects to provider url", async () => {
    const { signInWithGoogleAction, createClient, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);

    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: {
        url: "https://accounts.google.com/o/oauth2/auth",
      },
      error: null,
    });

    await signInWithGoogleAction();
    expect(redirect).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/auth");
  });

  it("signs out and redirects to sign-in", async () => {
    const { signOutAction, createClient, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);
    supabase.auth.signOut.mockResolvedValue({ error: null });

    await signOutAction();

    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});
