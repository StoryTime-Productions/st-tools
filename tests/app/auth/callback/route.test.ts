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
    expect(response.headers.get("location")).toContain(
      "/auth/sign-in?error=Could%20not%20confirm%20your%20account."
    );
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
    expect(response.headers.get("location")).toContain(
      "/auth/sign-in?error=Could%20not%20sync%20your%20account%20profile."
    );
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
    expect(response.headers.get("location")).toContain(
      "/auth/sign-in?error=Could%20not%20determine%20an%20email%20for%20this%20account."
    );
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
      },
    });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.test/boards");
  });
});
