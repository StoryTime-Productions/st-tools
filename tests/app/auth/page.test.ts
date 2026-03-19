import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAuthPageModule() {
  const redirect = vi.fn();

  vi.doMock("next/navigation", () => ({ redirect }));

  const authPageModule = await import("@/app/auth/page");

  return {
    ...authPageModule,
    redirect,
  };
}

describe("AuthPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects to sign-in", async () => {
    const { default: AuthPage, redirect } = await loadAuthPageModule();

    AuthPage();

    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });
});
