import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadBoardsPageModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();
  const getAccessibleBoardWhere = vi.fn(() => ({ mocked: true }));
  const getUserDisplayName = vi.fn(
    (owner: { name: string | null; email: string }) => owner.name ?? owner.email
  );
  const findMany = vi.fn();

  const boardList = vi.fn(({ boards }: { boards: unknown[] }) => (
    <div data-testid="board-list">{boards.length} boards rendered</div>
  ));

  const createBoardDialog = vi.fn(({ triggerLabel = "New board" }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel}</button>
  ));

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/boards", () => ({ getAccessibleBoardWhere, getUserDisplayName }));
  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      board: {
        findMany,
      },
    },
  }));
  vi.doMock("@/app/boards/_components/board-list", () => ({ BoardList: boardList }));
  vi.doMock("@/app/boards/_components/create-board-dialog", () => ({
    CreateBoardDialog: createBoardDialog,
  }));

  const boardsPageModule = await import("@/app/boards/page");

  return {
    ...boardsPageModule,
    redirect,
    getCurrentUser,
    getAccessibleBoardWhere,
    getUserDisplayName,
    findMany,
    boardList,
    createBoardDialog,
  };
}

describe("BoardsPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users", async () => {
    const { default: BoardsPage, getCurrentUser, redirect } = await loadBoardsPageModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(BoardsPage()).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("renders empty state when user has no boards", async () => {
    const {
      default: BoardsPage,
      getCurrentUser,
      findMany,
      boardList,
    } = await loadBoardsPageModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });
    findMany.mockResolvedValueOnce([]);

    const output = await BoardsPage();
    render(output);

    expect(screen.getByText("No boards yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create your first board" })).toBeInTheDocument();
    expect(boardList).not.toHaveBeenCalled();
  });

  it("maps board rows and renders board list metrics", async () => {
    const {
      default: BoardsPage,
      getCurrentUser,
      findMany,
      boardList,
      getAccessibleBoardWhere,
      getUserDisplayName,
    } = await loadBoardsPageModule();

    const user = {
      id: "admin-id",
      role: "ADMIN",
    };

    getCurrentUser.mockResolvedValueOnce(user);
    findMany.mockResolvedValueOnce([
      {
        id: "board-1",
        title: "Team roadmap",
        ownerId: "owner-id",
        isPersonal: false,
        isOpenToWorkspace: false,
        createdAt: new Date("2026-03-18T00:00:00.000Z"),
        owner: {
          name: "Olivia Owner",
          email: "owner@example.com",
        },
        columns: [{ _count: { cards: 2 } }, { _count: { cards: 3 } }],
      },
      {
        id: "board-2",
        title: "Private notes",
        ownerId: "admin-id",
        isPersonal: true,
        isOpenToWorkspace: false,
        createdAt: new Date("2026-03-19T00:00:00.000Z"),
        owner: {
          name: null,
          email: "admin@example.com",
        },
        columns: [{ _count: { cards: 1 } }],
      },
    ]);

    const output = await BoardsPage();
    render(output);

    expect(getAccessibleBoardWhere).toHaveBeenCalledWith({ id: user.id, role: user.role });
    expect(getUserDisplayName).toHaveBeenCalled();
    expect(screen.getByText("Your boards")).toBeInTheDocument();
    expect(screen.getByText("2 total")).toBeInTheDocument();

    expect(boardList).toHaveBeenCalledTimes(1);
    const mappedBoards = boardList.mock.calls[0][0].boards as Array<Record<string, unknown>>;
    expect(mappedBoards[0]).toMatchObject({
      id: "board-1",
      title: "Team roadmap",
      cardCount: 5,
      ownerLabel: "Owned by Olivia Owner",
      scopeLabel: "Collaborative",
      accessDescription: "Shared with selected teammates.",
      canManage: true,
    });
    expect(mappedBoards[1]).toMatchObject({
      id: "board-2",
      title: "Private notes",
      cardCount: 1,
      ownerLabel: "Owned by you",
      scopeLabel: "Private",
      accessDescription: "Visible only to your account.",
      canManage: true,
    });
  });
});
