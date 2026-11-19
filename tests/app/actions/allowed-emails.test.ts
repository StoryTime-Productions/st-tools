import { beforeEach, describe, expect, it, vi } from "vitest";

async function load(role: "ADMIN" | "MEMBER" | null = "ADMIN") {
  const revalidatePath = vi.fn();
  const findUnique = vi.fn();
  const create = vi.fn();
  const deleteMany = vi.fn();
  const findFirst = vi.fn();
  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/get-current-user", () => ({
    getCurrentUser: vi.fn(async () => (role ? { id: "u1", email: "admin@x.gg", role } : null)),
  }));
  vi.doMock("@/lib/prisma", () => ({
    prisma: { allowedEmail: { findUnique, create, deleteMany }, user: { findFirst } },
  }));
  const actions = await import("@/app/actions/allowed-emails");
  return { ...actions, revalidatePath, findUnique, create, deleteMany, findFirst };
}

beforeEach(() => {
  vi.resetModules();
});

describe("addAllowedEmailAction", () => {
  it("refuses anyone who is not an admin and writes nothing", async () => {
    for (const role of ["MEMBER", null] as const) {
      vi.resetModules();
      const m = await load(role);
      await expect(m.addAllowedEmailAction("a@b.co")).resolves.toEqual({
        error: "Forbidden: Admin access required",
      });
      expect(m.create).not.toHaveBeenCalled();
    }
  });

  it("rejects a malformed or oversized email", async () => {
    const m = await load();
    await expect(m.addAllowedEmailAction("not an email")).resolves.toEqual({
      error: "Enter a valid email address.",
    });
    await expect(m.addAllowedEmailAction(`${"a".repeat(250)}@b.co`)).resolves.toEqual({
      error: "That email is too long.",
    });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("says so when the email is already on the list", async () => {
    const m = await load();
    m.findUnique.mockResolvedValue({ email: "a@b.co" });
    await expect(m.addAllowedEmailAction(" A@B.co ")).resolves.toEqual({
      error: "That email is already on the list.",
    });
    expect(m.findUnique).toHaveBeenCalledWith({ where: { email: "a@b.co" } });
    expect(m.create).not.toHaveBeenCalled();
  });

  it("reports a double click as already listed instead of crashing", async () => {
    const m = await load();
    m.findUnique.mockResolvedValue(null);
    m.create.mockRejectedValue({ code: "P2002" });
    await expect(m.addAllowedEmailAction("a@b.co")).resolves.toEqual({
      error: "That email is already on the list.",
    });
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("lets any other database failure through", async () => {
    const m = await load();
    m.findUnique.mockResolvedValue(null);
    m.create.mockRejectedValue(new Error("db down"));
    await expect(m.addAllowedEmailAction("a@b.co")).rejects.toThrow("db down");
  });

  it("stores the email trimmed and lowercased, records who added it and refreshes the page", async () => {
    const m = await load();
    m.findUnique.mockResolvedValue(null);
    await expect(m.addAllowedEmailAction("  Friend@Example.COM ")).resolves.toEqual({
      success: true,
    });
    expect(m.create).toHaveBeenCalledWith({
      data: { email: "friend@example.com", addedBy: "admin@x.gg" },
    });
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/members");
  });
});

describe("removeAllowedEmailAction", () => {
  it("refuses anyone who is not an admin and deletes nothing", async () => {
    const m = await load("MEMBER");
    await expect(m.removeAllowedEmailAction("a@b.co")).resolves.toEqual({
      error: "Forbidden: Admin access required",
    });
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const m = await load();
    await expect(m.removeAllowedEmailAction("nope")).resolves.toEqual({
      error: "Enter a valid email address.",
    });
  });

  it("will not remove someone who already has an account", async () => {
    const m = await load();
    m.findFirst.mockResolvedValue({ id: "x" });
    await expect(m.removeAllowedEmailAction("a@b.co")).resolves.toEqual({
      error: "That person already has an account, so it can't be removed here.",
    });
    expect(m.deleteMany).not.toHaveBeenCalled();
  });

  it("removes an email that has not joined and refreshes the page", async () => {
    const m = await load();
    m.findFirst.mockResolvedValue(null);
    await expect(m.removeAllowedEmailAction("A@b.co")).resolves.toEqual({ success: true });
    expect(m.deleteMany).toHaveBeenCalledWith({ where: { email: "a@b.co" } });
    expect(m.revalidatePath).toHaveBeenCalledWith("/admin/members");
  });
});
