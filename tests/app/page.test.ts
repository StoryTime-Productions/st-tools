import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadHomeModule() {
  const redirect = vi.fn();
  const createClient = vi.fn();

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient }));

  const homeModule = await import("@/app/page");

  return {
    ...homeModule,
    redirect,
    createClient,
  };
}

describe("Home page redirects", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects authenticated users to dashboard", async () => {
    const { default: Home, createClient, redirect } = await loadHomeModule();

    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: { id: "11111111-1111-4111-8111-111111111111" },
          },
        }),
      },
    });

    await Home();

    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects unauthenticated users to sign-in", async () => {
    const { default: Home, createClient, redirect } = await loadHomeModule();

    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: {
            user: null,
          },
        }),
      },
    });

    await Home();

    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});
