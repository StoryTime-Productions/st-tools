import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectBoards } from "@/app/hub/projects/[projectId]/_components/project-boards";

const actionMocks = vi.hoisted(() => ({ setBoardProjectAction: vi.fn() }));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hub", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../../../helpers/native-select"));

const BOARDS = [
  { id: "b1", title: "Art", cardCount: 1, accessible: true },
  { id: "b2", title: "Secret", cardCount: 4, accessible: false },
];

describe("ProjectBoards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links accessible boards and shows only name and count for the rest", () => {
    render(<ProjectBoards projectId="p1" boards={BOARDS} standaloneBoards={null} />);

    expect(screen.getByRole("link", { name: "Art" })).toHaveAttribute("href", "/boards/b1");
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Secret/ })).not.toBeInTheDocument();
    expect(screen.getByText("Secret")).toBeInTheDocument();
    expect(screen.getByText("4 cards")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets admins attach and detach boards", async () => {
    actionMocks.setBoardProjectAction
      .mockResolvedValueOnce({ error: "Board not found" })
      .mockResolvedValue({ success: true });
    render(
      <ProjectBoards
        projectId="p1"
        boards={BOARDS}
        standaloneBoards={[{ id: "b3", title: "Loose" }]}
      />
    );

    const attach = screen.getByRole("button", { name: "Attach" });
    expect(attach).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b3" } });

    fireEvent.click(attach);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Board not found"));

    fireEvent.click(attach);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Board attached"));
    expect(actionMocks.setBoardProjectAction).toHaveBeenLastCalledWith("b3", "p1");
    expect(routerMocks.refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Detach Secret" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Board detached"));
    expect(actionMocks.setBoardProjectAction).toHaveBeenLastCalledWith("b2", null);
  });

  it("explains empty states", () => {
    render(<ProjectBoards projectId="p1" boards={[]} standaloneBoards={[]} />);

    expect(screen.getByText("No boards yet.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
