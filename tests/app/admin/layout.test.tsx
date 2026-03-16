import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadAdminLayoutModule() {
  const notFound = vi.fn();
  const getCurrentUser = vi.fn();
  const workspaceShell = vi.fn(({ children }: { children: React.ReactNode }) => (
    <div data-testid="workspace-shell">{children}</div>
  ));

  vi.doMock("next/navigation", () => ({ notFound }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/components/layout/workspace-shell", () => ({ WorkspaceShell: workspaceShell }));

  const adminLayoutModule = await import("@/app/admin/layout");

  return {
    ...adminLayoutModule,
    notFound,
    getCurrentUser,
    workspaceShell,
  };
}

describe("AdminLayout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("calls notFound for non-admin users", async () => {
    const { default: AdminLayout, getCurrentUser, notFound } = await loadAdminLayoutModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      name: "Member",
      email: "member@example.com",
      avatarUrl: null,
      role: "MEMBER",
    });

    notFound.mockImplementationOnce(() => {
      throw new Error("NOT_FOUND");
    });

    await expect(AdminLayout({ children: <div>child</div> })).rejects.toThrowError("NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("renders workspace shell for admins", async () => {
    const { default: AdminLayout, getCurrentUser, workspaceShell } = await loadAdminLayoutModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "22222222-2222-4222-8222-222222222222",
      name: "Admin",
      email: "admin@example.com",
      avatarUrl: null,
      role: "ADMIN",
    });

    const output = await AdminLayout({ children: <div>Admin content</div> });
    render(output);

    expect(workspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({
        activeNav: "members",
        title: "Admin",
      }),
      undefined
    );
    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });
});
