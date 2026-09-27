import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectBoards } from "@/app/hub/projects/[projectId]/_components/project-boards";

const actionMocks = vi.hoisted(() => ({
  setBoardProjectAction: vi.fn(),
  requestBoardAccessAction: vi.fn(),
  approveBoardAccessAction: vi.fn(),
  declineBoardAccessAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/app/actions/hub", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));
vi.mock("@/components/ui/select", async () => import("../../../../../helpers/native-select"));

const BOARDS = [
  { id: "b1", title: "Art", cardCount: 1, accessible: true, requested: false },
  { id: "b2", title: "Secret", cardCount: 4, accessible: false, requested: false },
  { id: "b3", title: "Vault", cardCount: 0, accessible: false, requested: true },
];

describe("ProjectBoards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links accessible boards and lets members request the rest", async () => {
    actionMocks.requestBoardAccessAction
      .mockResolvedValueOnce({ error: "Board not found" })
      .mockResolvedValue({ success: true });
    render(
      <ProjectBoards projectId="p1" boards={BOARDS} standaloneBoards={null} accessRequests={[]} />
    );

    expect(screen.getByRole("link", { name: "Art" })).toHaveAttribute("href", "/boards/b1");
    expect(screen.getByText("1 card")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Secret/ })).not.toBeInTheDocument();
    expect(screen.getByText("4 cards")).toBeInTheDocument();
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Vault/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Access requests" })).not.toBeInTheDocument();

    const request = screen.getByRole("button", { name: "Request access to Secret" });
    fireEvent.click(request);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Board not found"));

    fireEvent.click(request);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Access requested"));
    expect(actionMocks.requestBoardAccessAction).toHaveBeenLastCalledWith("b2");
    expect(routerMocks.refresh).toHaveBeenCalled();
  });

  it("lets admins attach and detach boards", async () => {
    actionMocks.setBoardProjectAction
      .mockResolvedValueOnce({ error: "Board not found" })
      .mockResolvedValue({ success: true });
    render(
      <ProjectBoards
        projectId="p1"
        boards={BOARDS}
        standaloneBoards={[{ id: "b9", title: "Loose" }]}
        accessRequests={[]}
      />
    );

    expect(screen.queryByRole("button", { name: /Request access/ })).not.toBeInTheDocument();
    const attach = screen.getByRole("button", { name: "Attach" });
    expect(attach).toBeDisabled();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "b9" } });

    fireEvent.click(attach);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Board not found"));

    await waitFor(() => expect(attach).toBeEnabled());
    fireEvent.click(attach);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Board attached"));
    expect(actionMocks.setBoardProjectAction).toHaveBeenLastCalledWith("b9", "p1");

    fireEvent.click(screen.getByRole("button", { name: "Detach Secret" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Board detached"));
    expect(actionMocks.setBoardProjectAction).toHaveBeenLastCalledWith("b2", null);
  });

  it("lets admins approve and decline access requests", async () => {
    actionMocks.approveBoardAccessAction.mockResolvedValue({ success: true });
    actionMocks.declineBoardAccessAction.mockResolvedValue({ success: true });
    render(
      <ProjectBoards
        projectId="p1"
        boards={BOARDS}
        standaloneBoards={[]}
        accessRequests={[
          { id: "r1", boardTitle: "Secret", userName: "Alice" },
          { id: "r2", boardTitle: "Vault", userName: "Bob" },
        ]}
      />
    );

    expect(screen.getByRole("region", { name: "Access requests" })).toHaveTextContent(
      "Alice wants to join Secret"
    );

    fireEvent.click(screen.getByRole("button", { name: "Approve Alice for Secret" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Access approved"));
    expect(actionMocks.approveBoardAccessAction).toHaveBeenCalledWith("r1");

    fireEvent.click(screen.getByRole("button", { name: "Decline Bob for Vault" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Request declined"));
    expect(actionMocks.declineBoardAccessAction).toHaveBeenCalledWith("r2");
  });

  it("explains empty states", () => {
    render(<ProjectBoards projectId="p1" boards={[]} standaloneBoards={[]} accessRequests={[]} />);

    expect(screen.getByText("No boards yet.")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
