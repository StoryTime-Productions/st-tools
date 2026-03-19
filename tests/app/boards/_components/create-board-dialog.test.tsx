import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateBoardDialog } from "@/app/boards/_components/create-board-dialog";

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

const actionMocks = vi.hoisted(() => ({
  createBoardAction: vi.fn(),
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

describe("CreateBoardDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a personal board and navigates to the new board", async () => {
    actionMocks.createBoardAction.mockResolvedValue({
      success: true,
      boardId: "11111111-1111-4111-8111-111111111111",
    });

    render(<CreateBoardDialog />);

    fireEvent.click(screen.getByRole("button", { name: /new board/i }));
    fireEvent.change(screen.getByLabelText("Board name"), {
      target: { value: "Personal board" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create board/i }));

    await waitFor(() => {
      expect(actionMocks.createBoardAction).toHaveBeenCalledWith({
        title: "Personal board",
        collaborative: false,
        openToWorkspace: true,
      });
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Personal board created");
    expect(routerMocks.push).toHaveBeenCalledWith("/boards/11111111-1111-4111-8111-111111111111");
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("creates a collaborative board with workspace access disabled", async () => {
    actionMocks.createBoardAction.mockResolvedValue({
      success: true,
      boardId: "22222222-2222-4222-8222-222222222222",
    });

    render(<CreateBoardDialog />);

    fireEvent.click(screen.getByRole("button", { name: /new board/i }));
    fireEvent.click(screen.getByRole("button", { name: /collaborative/i }));

    const workspaceCheckbox = screen.getByRole("checkbox");
    expect(workspaceCheckbox).toBeChecked();
    fireEvent.click(workspaceCheckbox);
    expect(workspaceCheckbox).not.toBeChecked();

    fireEvent.change(screen.getByLabelText("Board name"), {
      target: { value: "Team board" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create board/i }));

    await waitFor(() => {
      expect(actionMocks.createBoardAction).toHaveBeenCalledWith({
        title: "Team board",
        collaborative: true,
        openToWorkspace: false,
      });
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Collaborative board created");
  });

  it("shows error toast and keeps dialog open when creation fails", async () => {
    actionMocks.createBoardAction.mockResolvedValueOnce({ error: "Board title already exists" });

    render(<CreateBoardDialog />);

    fireEvent.click(screen.getByRole("button", { name: /new board/i }));
    fireEvent.change(screen.getByLabelText("Board name"), {
      target: { value: "Duplicate board" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create board/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Board title already exists");
    });

    expect(screen.getByText("Create a board")).toBeInTheDocument();
    expect(routerMocks.push).not.toHaveBeenCalled();
  });

  it("resets form values when the dialog is closed", () => {
    render(<CreateBoardDialog />);

    fireEvent.click(screen.getByRole("button", { name: /new board/i }));
    fireEvent.change(screen.getByLabelText("Board name"), {
      target: { value: "Temporary title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /collaborative/i }));

    fireEvent.click(screen.getAllByRole("button", { name: "Close" })[0]);

    fireEvent.click(screen.getByRole("button", { name: /new board/i }));

    const boardNameInput = screen.getByLabelText("Board name") as HTMLInputElement;
    expect(boardNameInput.value).toBe("");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
