import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadLayoutModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();
  const workspaceShell = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ));

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));

  const layoutModule = await import("@/app/bucket-list/layout");
  return { ...layoutModule, redirect, getCurrentUser, workspaceShell };
}

describe("BucketListLayout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to sign-in", async () => {
    const { default: BucketListLayout, getCurrentUser, redirect } = await loadLayoutModule();
    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(BucketListLayout({ children: <div>child</div> })).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("renders the workspace shell with the ST-uff navigation", async () => {
    const { default: BucketListLayout, getCurrentUser, workspaceShell } = await loadLayoutModule();
    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Alice",
      email: "alice@example.com",
      avatarUrl: null,
      role: "MEMBER",
    });

    render(await BucketListLayout({ children: <div>List content</div> }));

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({ activeNav: "bucket-list", title: "ST-uff" }),
      undefined
    );
    expect(screen.getByText("List content")).toBeInTheDocument();
  });
});
