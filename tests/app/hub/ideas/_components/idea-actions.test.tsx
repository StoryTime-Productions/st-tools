import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdeaActions } from "@/app/hub/ideas/_components/idea-actions";

const actionMocks = vi.hoisted(() => ({
  promoteIdeaAction: vi.fn(),
  dismissIdeaAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

describe("IdeaActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("promotes an idea and opens the new hangout", async () => {
    actionMocks.promoteIdeaAction
      .mockResolvedValueOnce({ error: "Idea not found or already promoted" })
      .mockResolvedValueOnce({ success: true, hangoutId: "h9" });
    render(<IdeaActions ideaId="i1" title="Karaoke" />);
    const promote = screen.getByRole("button", { name: "Promote" });

    fireEvent.click(promote);
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Idea not found or already promoted")
    );

    await waitFor(() => expect(promote).toBeEnabled());
    fireEvent.click(promote);
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/hub/hangouts/h9"));
    expect(actionMocks.promoteIdeaAction).toHaveBeenCalledWith("i1");
    expect(toastMocks.success).toHaveBeenCalledWith("Hangout created from idea");
  });

  it("confirms before dismissing", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    actionMocks.dismissIdeaAction
      .mockResolvedValueOnce({ error: "Forbidden: Admin access required" })
      .mockResolvedValueOnce({ success: true });
    render(<IdeaActions ideaId="i1" title="Karaoke" />);
    const dismiss = screen.getByRole("button", { name: "Dismiss" });

    fireEvent.click(dismiss);
    expect(actionMocks.dismissIdeaAction).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(dismiss);
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Forbidden: Admin access required")
    );

    await waitFor(() => expect(dismiss).toBeEnabled());
    fireEvent.click(dismiss);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Idea dismissed"));
    expect(routerMocks.refresh).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
