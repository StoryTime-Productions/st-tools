import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

function buildSupabaseClient() {
  return {
    auth: {
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      getUser: vi.fn(),
      updateUser: vi.fn(),
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

    expect(result).toEqual({ error: "We couldn't create your account. Try again." });
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

    expect(result).toEqual({ error: "We couldn't start sign-in with Google. Try again." });
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

    expect(result).toEqual({ error: "We couldn't start sign-in with Google. Try again." });
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

    await expect(signInAction({ email: "user@example.com", password: "" })).resolves.toEqual({
      error: "Enter your password",
    });

    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    await expect(
      signInAction({ email: "user@example.com", password: "password123" })
    ).resolves.toEqual({ error: "Wrong email or password." });

    for (const [code, message] of [
      ["email_not_confirmed", "Confirm your email first. Check your inbox for the link."],
      ["over_request_rate_limit", "Too many attempts. Wait a few minutes and try again."],
      ["over_email_send_rate_limit", "Too many attempts. Wait a few minutes and try again."],
      ["unexpected_failure", "We couldn't sign you in. Try again."],
    ]) {
      supabase.auth.signInWithPassword.mockResolvedValueOnce({
        error: { message: "raw server text that must never reach the user", code },
      });
      await expect(
        signInAction({ email: "user@example.com", password: "password123" })
      ).resolves.toEqual({ error: message });
    }

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

  it("starts discord oauth and redirects to provider url", async () => {
    const { signInWithDiscordAction, createClient, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);

    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://discord.com/oauth2/authorize" },
      error: null,
    });

    await signInWithDiscordAction();
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "discord" })
    );
    expect(redirect).toHaveBeenCalledWith("https://discord.com/oauth2/authorize");
  });

  it("asks Supabase for a reset email and always answers the same way", async () => {
    const { requestPasswordResetAction, createClient } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(requestPasswordResetAction({ email: "not an email" })).resolves.toEqual({
      error: "Invalid email address",
    });
    expect(supabase.auth.resetPasswordForEmail).not.toHaveBeenCalled();

    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({ error: null });
    await expect(requestPasswordResetAction({ email: "user@example.com" })).resolves.toEqual({
      success: true,
    });
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://example.com/auth/callback?next=/auth/reset-password",
    });

    // an unknown account and an unexpected failure look identical to the user
    supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({
      error: { message: "User not found", code: "user_not_found" },
    });
    await expect(requestPasswordResetAction({ email: "nobody@example.com" })).resolves.toEqual({
      success: true,
    });
    expect(errorSpy).toHaveBeenCalledWith("Failed to request a password reset", expect.anything());

    for (const code of ["over_request_rate_limit", "over_email_send_rate_limit"]) {
      supabase.auth.resetPasswordForEmail.mockResolvedValueOnce({
        error: { message: "slow down", code },
      });
      await expect(requestPasswordResetAction({ email: "user@example.com" })).resolves.toEqual({
        error: "Too many attempts. Wait a few minutes and try again.",
      });
    }
    errorSpy.mockRestore();
  });

  it("updates the password for a signed-in recovery session", async () => {
    const { updatePasswordAction, createClient, redirect } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);
    const values = { password: "newpassword1", confirmPassword: "newpassword1" };

    await expect(
      updatePasswordAction({ password: "short", confirmPassword: "short" })
    ).resolves.toEqual({ error: "Password must be at least 8 characters" });
    await expect(
      updatePasswordAction({ password: "newpassword1", confirmPassword: "different1" })
    ).resolves.toEqual({ error: "Passwords do not match" });

    supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
    await expect(updatePasswordAction(values)).resolves.toEqual({
      error: "This reset link has expired. Request a new one.",
    });
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();

    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    for (const [code, message] of [
      ["same_password", "Choose a different password from your current one."],
      ["weak_password", "Choose a stronger password."],
      ["over_request_rate_limit", "Too many attempts. Wait a few minutes and try again."],
      ["unexpected_failure", "We couldn't update your password. Try again."],
    ]) {
      supabase.auth.updateUser.mockResolvedValueOnce({
        error: { message: "raw server text that must never reach the user", code },
      });
      await expect(updatePasswordAction(values)).resolves.toEqual({ error: message });
    }
    expect(redirect).not.toHaveBeenCalled();

    supabase.auth.updateUser.mockResolvedValueOnce({ error: null });
    await updatePasswordAction(values);
    expect(supabase.auth.updateUser).toHaveBeenLastCalledWith({ password: "newpassword1" });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("maps sign-up error codes to fixed messages", async () => {
    const { signUpAction, createClient } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);
    const values = {
      email: "new@example.com",
      password: "password123",
      confirmPassword: "password123",
    };

    for (const [code, message] of [
      ["user_already_exists", "An account with that email already exists. Try signing in."],
      ["email_exists", "An account with that email already exists. Try signing in."],
      ["weak_password", "Choose a stronger password."],
      ["over_request_rate_limit", "Too many attempts. Wait a few minutes and try again."],
      ["over_email_send_rate_limit", "Too many attempts. Wait a few minutes and try again."],
    ]) {
      supabase.auth.signUp.mockResolvedValueOnce({
        data: { session: null, user: null },
        error: { message: "raw server text that must never reach the user", code },
      });
      await expect(signUpAction(values)).resolves.toEqual({ error: message });
    }
  });

  it("returns the provider error when discord oauth fails", async () => {
    const { signInWithDiscordAction, createClient } = await loadAuthModule();
    const supabase = buildSupabaseClient();
    createClient.mockResolvedValue(supabase);

    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "Discord disabled" },
    });

    expect(await signInWithDiscordAction()).toEqual({
      error: "We couldn't start sign-in with Discord. Try again.",
    });
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
