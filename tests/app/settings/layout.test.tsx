import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadSettingsLayoutModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();
  const workspaceShell = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ));

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));

  const settingsLayoutModule = await import("@/app/settings/layout");

  return {
    ...settingsLayoutModule,
    redirect,
    getCurrentUser,
    workspaceShell,
  };
}

describe("SettingsLayout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users", async () => {
    const { default: SettingsLayout, getCurrentUser, redirect } = await loadSettingsLayoutModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(SettingsLayout({ children: <div>child</div> })).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("renders workspace shell with profile navigation", async () => {
    const {
      default: SettingsLayout,
      getCurrentUser,
      workspaceShell,
    } = await loadSettingsLayoutModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Member",
      email: "member@example.com",
      avatarUrl: null,
      role: "MEMBER",
    });

    const output = await SettingsLayout({ children: <div>Settings content</div> });
    render(output);

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNav: "profile",
        title: "Settings",
      }),
      undefined
    );
    expect(screen.getByText("Settings content")).toBeInTheDocument();
  });
});
