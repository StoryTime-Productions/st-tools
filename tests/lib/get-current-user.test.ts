import { beforeEach, describe, expect, it, vi } from "vitest";

type MockedAuthUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

async function loadGetCurrentUserModule() {
  const createClient = vi.fn();
  const upsert = vi.fn();

  vi.doMock("@/lib/supabase/server", () => ({
    createClient,
  }));

  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      user: {
        upsert,
      },
    },
  }));

  const { getCurrentUser } = await import("@/lib/get-current-user");

  return {
    getCurrentUser,
    createClient,
    upsert,
  };
}

function buildSupabaseClient(user: MockedAuthUser | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user,
        },
      }),
    },
  };
}

describe("getCurrentUser", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns null when auth session has no user", async () => {
    const { getCurrentUser, createClient, upsert } = await loadGetCurrentUserModule();

    createClient.mockResolvedValue(buildSupabaseClient(null));

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns null when user has no usable email", async () => {
    const { getCurrentUser, createClient, upsert } = await loadGetCurrentUserModule();

    createClient.mockResolvedValue(
      buildSupabaseClient({
        id: "u-1",
        email: "   ",
        user_metadata: {},
      })
    );

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("uses metadata email when top-level email is absent", async () => {
    const { getCurrentUser, createClient, upsert } = await loadGetCurrentUserModule();

    createClient.mockResolvedValue(
      buildSupabaseClient({
        id: "u-2",
        email: null,
        user_metadata: {
          email: "meta@example.com",
          full_name: "Meta Name",
          avatar_url: "https://example.com/avatar.png",
        },
      })
    );

    upsert.mockResolvedValue({ id: "u-2", email: "meta@example.com" });

    await getCurrentUser();

    expect(upsert).toHaveBeenCalledWith({
      where: { id: "u-2" },
      update: {},
      create: {
        id: "u-2",
        email: "meta@example.com",
        name: "Meta Name",
        avatarUrl: "https://example.com/avatar.png",
      },
    });
  });

  it("prefers user.email and returns upsert result", async () => {
    const { getCurrentUser, createClient, upsert } = await loadGetCurrentUserModule();

    createClient.mockResolvedValue(
      buildSupabaseClient({
        id: "u-3",
        email: "owner@example.com",
        user_metadata: {
          email: "meta@example.com",
          name: "Preferred Name",
        },
      })
    );

    const expected = { id: "u-3", email: "owner@example.com" };
    upsert.mockResolvedValue(expected);

    await expect(getCurrentUser()).resolves.toEqual(expected);
  });
});
