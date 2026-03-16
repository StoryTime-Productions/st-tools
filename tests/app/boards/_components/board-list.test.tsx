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
      scopeLabel: "Collaborative",
      accessDescription: "Open to the workspace",
      canManage: true,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      href: "/boards/22222222-2222-4222-8222-222222222222",
      title: "Read-only Board",
      createdAtLabel: "Yesterday",
      cardCount: 2,
      ownerLabel: "Owned by teammate",
      scopeLabel: "Personal",
      accessDescription: "Invite-only",
      canManage: false,
    },
  ];
}

describe("BoardList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.renameBoardAction.mockResolvedValue({ success: true });
    actionMocks.deleteBoardAction.mockResolvedValue({ success: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rows and only shows manage actions for manageable boards", () => {
    render(<BoardList boards={makeBoards()} />);

    expect(screen.getByRole("link", { name: "Project Alpha" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read-only Board" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /rename/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /open/i })).toHaveLength(2);
  });

  it("renames a board and refreshes the page on success", async () => {
    const managedBoard = makeBoards()[0];
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByLabelText("Board title"), {
      target: { value: "Project Beta" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(actionMocks.renameBoardAction).toHaveBeenCalledWith(managedBoard.id, "Project Beta");
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Board renamed");
    expect(routerMocks.refresh).toHaveBeenCalled();
    expect(screen.queryByLabelText("Board title")).not.toBeInTheDocument();
  });

  it("exits edit mode without calling rename when title is unchanged", () => {
    const managedBoard = makeBoards()[0];
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(actionMocks.renameBoardAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Board title")).not.toBeInTheDocument();
  });

  it("shows an error toast when rename fails", async () => {
    const managedBoard = makeBoards()[0];
    actionMocks.renameBoardAction.mockResolvedValueOnce({ error: "Cannot rename board" });
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByLabelText("Board title"), {
      target: { value: "Broken rename" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Cannot rename board");
    });
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("does not delete when confirmation is cancelled", () => {
    const managedBoard = makeBoards()[0];
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(actionMocks.deleteBoardAction).not.toHaveBeenCalled();
  });

  it("deletes a board and handles success and error outcomes", async () => {
    const managedBoard = makeBoards()[0];
    actionMocks.deleteBoardAction
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ error: "Cannot delete board" });

    const { rerender } = render(<BoardList boards={[managedBoard]} />);

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(actionMocks.deleteBoardAction).toHaveBeenCalledWith(managedBoard.id);
      expect(toastMocks.success).toHaveBeenCalledWith("Board deleted");
    });

    rerender(<BoardList boards={[managedBoard]} />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Cannot delete board");
    });
    expect(routerMocks.refresh).toHaveBeenCalled();
  });
});
