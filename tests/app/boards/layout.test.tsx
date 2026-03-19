import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadBoardsLayoutModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();
  const workspaceShell = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ));

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));

  const boardsLayoutModule = await import("@/app/boards/layout");

  return {
    ...boardsLayoutModule,
    redirect,
    getCurrentUser,
    workspaceShell,
  };
}

describe("BoardsLayout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to sign-in", async () => {
    const { default: BoardsLayout, getCurrentUser, redirect } = await loadBoardsLayoutModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(BoardsLayout({ children: <div>child</div> })).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("renders workspace shell with boards navigation", async () => {
    const {
      default: BoardsLayout,
      getCurrentUser,
      workspaceShell,
    } = await loadBoardsLayoutModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Board Owner",
      email: "owner@example.com",
      avatarUrl: null,
      role: "MEMBER",
    });

    const output = await BoardsLayout({ children: <div>Boards content</div> });
    render(output);

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNav: "boards",
        title: "Boards",
      }),
      undefined
    );
    expect(screen.getByText("Boards content")).toBeInTheDocument();
  });
});
