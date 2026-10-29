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
    const promote = screen.getByRole("button", { name: "Promote Karaoke" });

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

  it("names each action after its idea", () => {
    render(<IdeaActions ideaId="i1" title="Karaoke" />);

    expect(screen.getByRole("button", { name: "Promote Karaoke" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Dismiss Karaoke" })).toBeVisible();
  });

  it("asks in a destructive themed dialog before dismissing, and does nothing on cancel", async () => {
    render(<IdeaActions ideaId="i1" title="Karaoke" />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Karaoke" }));
    expect(await screen.findByText("Dismiss this idea?")).toBeVisible();
    expect(screen.getByText(/"Karaoke" will be deleted/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveAttribute(
      "data-variant",
      "destructive"
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("Dismiss this idea?")).not.toBeInTheDocument());
    expect(actionMocks.dismissIdeaAction).not.toHaveBeenCalled();
  });

  it("dismisses once confirmed, reporting a failure first", async () => {
    actionMocks.dismissIdeaAction
      .mockResolvedValueOnce({ error: "Forbidden: Admin access required" })
      .mockResolvedValueOnce({ success: true });
    render(<IdeaActions ideaId="i1" title="Karaoke" />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss Karaoke" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() =>
      expect(toastMocks.error).toHaveBeenCalledWith("Forbidden: Admin access required")
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Dismiss Karaoke" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss Karaoke" }));
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Idea dismissed"));
    expect(routerMocks.refresh).toHaveBeenCalled();
  });
});
