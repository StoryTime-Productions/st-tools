import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadAdminModule() {
  const revalidatePath = vi.fn();
  const getCurrentUser = vi.fn();
  const update = vi.fn();

  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      user: {
        update,
      },
    },
  }));

  const adminModule = await import("@/app/actions/admin");

  return {
    ...adminModule,
    revalidatePath,
    getCurrentUser,
    update,
  };
}

describe("updateUserRoleAction", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects non-admin users", async () => {
    const { updateUserRoleAction, getCurrentUser } = await loadAdminModule();

    getCurrentUser.mockResolvedValue({ role: "MEMBER" });

    await expect(
      updateUserRoleAction("11111111-1111-4111-8111-111111111111", "ADMIN")
    ).resolves.toEqual({ error: "Forbidden: Admin access required" });
  });

  it("validates payload and updates role for admins", async () => {
    const { updateUserRoleAction, getCurrentUser, update, revalidatePath } =
      await loadAdminModule();

    getCurrentUser.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      role: "ADMIN",
    });

    await expect(updateUserRoleAction("invalid", "ADMIN")).resolves.toEqual({
      error: "Invalid UUID",
    });

    await expect(
      updateUserRoleAction("22222222-2222-4222-8222-222222222222", "MEMBER")
    ).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      data: { role: "MEMBER" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/members");
  });
});
