import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BoardList, type BoardListItem } from "@/app/boards/_components/board-list";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const actionMocks = vi.hoisted(() => ({
  renameBoardAction: vi.fn(),
  deleteBoardAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("@/app/actions/boards", () => actionMocks);

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

function makeBoards(): BoardListItem[] {
  return [
    {
      id: "11111111-1111-4111-8111-111111111111",
      href: "/boards/11111111-1111-4111-8111-111111111111",
      title: "Project Alpha",
      createdAtLabel: "Today",
      cardCount: 5,
      ownerLabel: "Owned by you",
      memberLabel: "4 members",
      canManage: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      href: "/boards/22222222-2222-4222-8222-222222222222",
      title: "Read-only Board",
      createdAtLabel: "Yesterday",
      cardCount: 2,
      ownerLabel: "Owned by teammate",
      memberLabel: "1 member",
      canManage: false,
    },
  ];
}

describe("BoardList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.renameBoardAction.mockResolvedValue({ success: true });
    actionMocks.deleteBoardAction.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows and only shows manage actions for manageable boards", () => {
    render(<BoardList boards={makeBoards()} />);

    expect(screen.getByRole("link", { name: "Project Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read-only Board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename Project Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Project Alpha" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Read-only Board/ })).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent("Owned by you · 4 members · 5 cards · Created Today");
  });

  it("renames a board and refreshes the page on success", async () => {
    const managedBoard = makeBoards()[0];
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Project Alpha" }));
    fireEvent.change(screen.getByLabelText("New title for Project Alpha"), {
      target: { value: "Project Beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(actionMocks.renameBoardAction).toHaveBeenCalledWith(managedBoard.id, "Project Beta");
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Board renamed");
    expect(routerMocks.refresh).toHaveBeenCalled();
    expect(screen.queryByLabelText("New title for Project Alpha")).not.toBeInTheDocument();
  });

  it("exits edit mode without calling rename when title is unchanged", () => {
    const managedBoard = makeBoards()[0];
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Project Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(actionMocks.renameBoardAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("New title for Project Alpha")).not.toBeInTheDocument();
  });

  it("shows rename errors inline", async () => {
    const managedBoard = makeBoards()[0];
    actionMocks.renameBoardAction.mockResolvedValueOnce({ error: "Cannot rename board" });
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Project Alpha" }));
    fireEvent.change(screen.getByLabelText("New title for Project Alpha"), {
      target: { value: "Broken rename" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cannot rename board");
    expect(toastMocks.error).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Cannot rename board");
  });

  it("cancels renaming with Escape and returns focus to Rename", async () => {
    render(<BoardList boards={[makeBoards()[0]]} />);

    fireEvent.click(screen.getByRole("button", { name: "Rename Project Alpha" }));
    fireEvent.keyDown(screen.getByLabelText("New title for Project Alpha"), { key: "Escape" });

    expect(screen.queryByLabelText("New title for Project Alpha")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Rename Project Alpha" })).toHaveFocus()
    );
  });

  it("does not delete when confirmation is cancelled", () => {
    const managedBoard = makeBoards()[0];
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Project Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(actionMocks.deleteBoardAction).not.toHaveBeenCalled();
  });

  it("deletes a board and handles success and error outcomes", async () => {
    const managedBoard = makeBoards()[0];
    actionMocks.deleteBoardAction
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ error: "Cannot delete board" });

    const { rerender } = render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: "Delete Project Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));

    await waitFor(() => {
      expect(actionMocks.deleteBoardAction).toHaveBeenCalledWith(managedBoard.id);
      expect(toastMocks.success).toHaveBeenCalledWith("Board deleted");
    });

    rerender(<BoardList boards={[managedBoard]} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete Project Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete board" }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Cannot delete board");
    });
    expect(routerMocks.refresh).toHaveBeenCalled();
  });
});
