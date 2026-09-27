import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CancelHangoutButton, HangoutDialog } from "@/app/hub/_components/hangout-dialog";

const actionMocks = vi.hoisted(() => ({
  createHangoutAction: vi.fn(),
  updateHangoutAction: vi.fn(),
  cancelHangoutAction: vi.fn(),
}));
const toastMocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const routerMocks = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("@/app/actions/hangouts", () => actionMocks);
vi.mock("sonner", () => ({ toast: toastMocks }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

const HANGOUT = {
  id: "h1",
  title: "Beach day",
  description: "Bring sunscreen",
  discordThreadUrl: null,
};

describe("HangoutDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a hangout and opens it", async () => {
    actionMocks.createHangoutAction
      .mockResolvedValueOnce({ error: "Thread link must be a discord.com/channels/... link" })
      .mockResolvedValueOnce({ success: true, hangoutId: "h2" });
    render(<HangoutDialog />);

    fireEvent.click(screen.getByRole("button", { name: "New hangout" }));
    expect(screen.getByRole("button", { name: "Create hangout" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Picnic" } });
    fireEvent.change(screen.getByLabelText("Discord thread link"), {
      target: { value: " https://example.com " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create hangout" }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalled());
    expect(actionMocks.createHangoutAction).toHaveBeenCalledWith({
      title: "Picnic",
      description: null,
      discordThreadUrl: "https://example.com",
    });

    fireEvent.click(await screen.findByRole("button", { name: "Create hangout" }));
    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/hub/hangouts/h2"));
    expect(toastMocks.success).toHaveBeenCalledWith("Hangout created");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("edits an existing hangout and resets on close", async () => {
    actionMocks.updateHangoutAction.mockResolvedValue({ success: true });
    render(<HangoutDialog hangout={HANGOUT} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit hangout" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lake day" } });
    fireEvent.keyDown(screen.getByLabelText("Title"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Edit hangout" }));
    expect(screen.getByLabelText("Title")).toHaveValue("Beach day");

    fireEvent.change(screen.getByLabelText("Description"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Hangout updated"));
    expect(actionMocks.updateHangoutAction).toHaveBeenCalledWith({
      hangoutId: "h1",
      title: "Beach day",
      description: null,
      discordThreadUrl: null,
    });
    expect(routerMocks.push).not.toHaveBeenCalled();
    expect(routerMocks.refresh).toHaveBeenCalled();
  });
});

describe("CancelHangoutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms before cancelling and reports errors", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false);
    actionMocks.cancelHangoutAction
      .mockResolvedValueOnce({ error: "Hangout not found" })
      .mockResolvedValueOnce({ success: true });
    render(<CancelHangoutButton hangoutId="h1" title="Beach day" />);
    const button = screen.getByRole("button", { name: "Cancel hangout" });

    fireEvent.click(button);
    expect(actionMocks.cancelHangoutAction).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(button);
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith("Hangout not found"));

    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith("Hangout cancelled"));
    expect(actionMocks.cancelHangoutAction).toHaveBeenCalledWith("h1");
    expect(routerMocks.refresh).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
