import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminMembersPage from "@/app/admin/members/page";

const roleSelectMock = vi.hoisted(() =>
  vi.fn(({ userId, currentRole }: { userId: string; currentRole: string }) => (
    <div data-testid={`role-select-${userId}`}>{currentRole}</div>
  ))
);

vi.mock("@/lib/get-current-user", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/app/admin/members/_components/role-select", () => ({
  RoleSelect: roleSelectMock,
}));

const { getCurrentUser } = await import("@/lib/get-current-user");
const { prisma } = await import("@/lib/prisma");
const getCurrentUserMock = vi.mocked(getCurrentUser);
const findManyMock = vi.mocked(prisma.user.findMany);

describe("AdminMembersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders member summary cards and admin badge", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "admin-1",
        name: "Alice Admin",
        email: "alice@example.com",
        avatarUrl: null,
        role: "ADMIN",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        id: "member-1",
        name: "Bob Member",
        email: "bob@example.com",
        avatarUrl: null,
        role: "MEMBER",
        createdAt: new Date("2026-01-02T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      {
        id: "member-2",
        name: "Cara Member",
        email: "cara@example.com",
        avatarUrl: null,
        role: "MEMBER",
        createdAt: new Date("2026-01-03T00:00:00.000Z"),
        updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      },
    ]);
    getCurrentUserMock.mockResolvedValueOnce({
      id: "admin-1",
      name: "Alice Admin",
      role: "ADMIN",
      email: "alice@example.com",
      avatarUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const output = await AdminMembersPage();
    render(output);

    expect(screen.getByText("Total members")).toBeInTheDocument();
    expect(screen.getByText("Administrators")).toBeInTheDocument();
    expect(screen.getAllByText("Members").length).toBeGreaterThan(0);
    expect(screen.getByText("1 admin")).toBeInTheDocument();

    expect(findManyMock).toHaveBeenCalledWith({
      orderBy: { createdAt: "asc" },
    });
  });

  it("renders the members table rows and passes role props", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "admin-1",
        name: "Alice Admin",
        email: "alice@example.com",
        avatarUrl: null,
        role: "ADMIN",
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
      },
      {
        id: "member-1",
        name: "Bob Member",
        email: "bob@example.com",
        avatarUrl: null,
        role: "MEMBER",
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
        updatedAt: new Date("2026-02-02T00:00:00.000Z"),
      },
    ]);
    getCurrentUserMock.mockResolvedValueOnce({
      id: "admin-1",
      name: "Alice Admin",
      role: "ADMIN",
      email: "alice@example.com",
      avatarUrl: null,
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const output = await AdminMembersPage();
    render(output);

    expect(screen.getByText("Alice Admin")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("Bob Member")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    expect(screen.getByTestId("role-select-admin-1")).toHaveTextContent("ADMIN");
    expect(screen.getByTestId("role-select-member-1")).toHaveTextContent("MEMBER");

    expect(roleSelectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "admin-1",
        currentRole: "ADMIN",
        currentUserId: "admin-1",
      }),
      undefined
    );
  });

  it("uses email initial fallback when member name is missing", async () => {
    findManyMock.mockResolvedValueOnce([
      {
        id: "admin-1",
        name: "Alice Admin",
        email: "alice@example.com",
        avatarUrl: null,
        role: "ADMIN",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        id: "member-no-name",
        name: null,
        email: "zeta@example.com",
        avatarUrl: null,
        role: "MEMBER",
        createdAt: new Date("2026-03-02T00:00:00.000Z"),
        updatedAt: new Date("2026-03-02T00:00:00.000Z"),
      },
    ]);
    getCurrentUserMock.mockResolvedValueOnce({
      id: "admin-1",
      name: "Alice Admin",
      role: "ADMIN",
      email: "alice@example.com",
      avatarUrl: null,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const output = await AdminMembersPage();
    render(output);

    expect(screen.getByText("zeta@example.com")).toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();
  });
});
