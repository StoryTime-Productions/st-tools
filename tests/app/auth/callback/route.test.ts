import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/auth/callback/route";

const createClientMock = vi.hoisted(() => vi.fn());
const prismaUserUpsertMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: prismaUserUpsertMock,
    },
  },
}));

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to sign-in with error when no code is provided", async () => {
    const request = new Request("https://example.test/auth/callback");

    const response = await GET(request as never);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/sign-in?error=confirm");
  });

  it("redirects with profile sync error when upsert fails", async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "11111111-1111-4111-8111-111111111111",
              email: "owner@example.com",
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
    });
    prismaUserUpsertMock.mockRejectedValueOnce(new Error("db unavailable"));

    const request = new Request("https://example.test/auth/callback?code=abc123");

    const response = await GET(request as never);

    expect(prismaUserUpsertMock).toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/sign-in?error=sync");
  });

  it("redirects with email error when callback user email is missing", async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "12121212-1212-4121-8121-121212121212",
              email: null,
              user_metadata: {},
            },
          },
          error: null,
        }),
      },
    });

    const request = new Request("https://example.test/auth/callback?code=no-email");

    const response = await GET(request as never);

    expect(prismaUserUpsertMock).not.toHaveBeenCalled();
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/auth/sign-in?error=email");
  });

  it("upserts user and redirects to next destination on success", async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "22222222-2222-4222-8222-222222222222",
              email: null,
              user_metadata: {
                email: "member@example.com",
              },
            },
          },
          error: null,
        }),
      },
    });
    prismaUserUpsertMock.mockResolvedValueOnce({});

    const request = new Request(
      "https://example.test/auth/callback?code=success-code&next=/boards"
    );

    const response = await GET(request as never);

    expect(prismaUserUpsertMock).toHaveBeenCalledWith({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      update: {},
      create: {
        id: "22222222-2222-4222-8222-222222222222",
        email: "member@example.com",
        discordId: null,
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/boards");
  });

  it("verifies a recovery token hash so the link works on another device", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: "44444444-4444-4444-8444-444444444444", email: "a@example.com" } },
      error: null,
    });
    createClientMock.mockResolvedValueOnce({ auth: { verifyOtp } });
    prismaUserUpsertMock.mockResolvedValueOnce({});

    const response = await GET(
      new Request(
        "https://example.test/auth/callback?token_hash=hash123&type=recovery&next=/auth/reset-password"
      ) as never
    );

    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash123" });
    expect(response.headers.get("location")).toBe("https://example.test/auth/reset-password");
  });

  it("ignores a token hash that is not a recovery link", async () => {
    const response = await GET(
      new Request("https://example.test/auth/callback?token_hash=hash123&type=magiclink") as never
    );

    expect(createClientMock).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("/auth/sign-in?error=confirm");
  });

  it("sends an expired or used reset link back to the request page", async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        verifyOtp: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: "x" } }),
      },
    });

    const response = await GET(
      new Request(
        "https://example.test/auth/callback?token_hash=used&type=recovery&next=/auth/reset-password"
      ) as never
    );

    expect(response.headers.get("location")).toBe(
      "https://example.test/auth/forgot-password?error=expired"
    );
  });

  it("only follows same-site next paths", async () => {
    for (const next of ["@evil.example", "//evil.example", "https://evil.example", ""]) {
      const response = await GET(
        new Request(`https://example.test/auth/callback?next=${encodeURIComponent(next)}`) as never
      );
      expect(response.headers.get("location")).toBe(
        "https://example.test/auth/sign-in?error=confirm"
      );
    }
  });

  it("stores the Discord id after linking a Discord identity", async () => {
    createClientMock.mockResolvedValueOnce({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: {
            user: {
              id: "33333333-3333-4333-8333-333333333333",
              email: "admin@example.com",
              user_metadata: {},
              identities: [
                { provider: "email", identity_data: { sub: "33333333" } },
                { provider: "discord", identity_data: { sub: "123456789012345678" } },
              ],
            },
          },
          error: null,
        }),
      },
    });
    prismaUserUpsertMock.mockResolvedValueOnce({});

    const response = await GET(
      new Request("https://example.test/auth/callback?code=link&next=/settings/profile") as never
    );

    expect(prismaUserUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ update: { discordId: "123456789012345678" } })
    );
    expect(response.headers.get("location")).toBe("https://example.test/settings/profile");
  });
});
