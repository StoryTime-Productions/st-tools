import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadBoardDetailPageModule() {
  const redirect = vi.fn();
  const notFound = vi.fn();
  const getCurrentUser = vi.fn();
  const getBoardDetailsData = vi.fn();
  const boardView = vi.fn(({ board }: { board: { title: string } }) => (
    <div data-testid="board-view">{board.title}</div>
  ));

  vi.doMock("next/navigation", () => ({ redirect, notFound }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/lib/board-details", () => ({ getBoardDetailsData }));
  vi.doMock("@/app/boards/[boardId]/_components/board-view", () => ({ BoardView: boardView }));

  const boardDetailModule = await import("@/app/boards/[boardId]/page");

  return {
    ...boardDetailModule,
    redirect,
    notFound,
    getCurrentUser,
    getBoardDetailsData,
    boardView,
  };
}

describe("BoardDetailPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users", async () => {
    const {
      default: BoardDetailPage,
      getCurrentUser,
      redirect,
    } = await loadBoardDetailPageModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(
      BoardDetailPage({ params: Promise.resolve({ boardId: "board-1" }) })
    ).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("calls notFound when board does not exist", async () => {
    const {
      default: BoardDetailPage,
      getCurrentUser,
      getBoardDetailsData,
      notFound,
    } = await loadBoardDetailPageModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "MEMBER",
    });
    getBoardDetailsData.mockResolvedValueOnce(null);
    notFound.mockImplementationOnce(() => {
      throw new Error("NOT_FOUND");
    });

    await expect(
      BoardDetailPage({ params: Promise.resolve({ boardId: "board-1" }) })
    ).rejects.toThrowError("NOT_FOUND");
  });

  it("renders board view when board exists", async () => {
    const {
      default: BoardDetailPage,
      getCurrentUser,
      getBoardDetailsData,
      boardView,
    } = await loadBoardDetailPageModule();

    getCurrentUser.mockResolvedValueOnce({
      id: "11111111-1111-4111-8111-111111111111",
      role: "ADMIN",
    });
    getBoardDetailsData.mockResolvedValueOnce({
      id: "board-42",
      title: "Architecture board",
    });

    const output = await BoardDetailPage({ params: Promise.resolve({ boardId: "board-42" }) });
    render(output);

    expect(getBoardDetailsData).toHaveBeenCalledWith("board-42", {
      id: "11111111-1111-4111-8111-111111111111",
      role: "ADMIN",
    });
    expect(boardView).toHaveBeenCalled();
    expect(screen.getByTestId("board-view")).toHaveTextContent("Architecture board");
  });
});
