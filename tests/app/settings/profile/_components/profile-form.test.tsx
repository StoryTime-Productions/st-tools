import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfileForm } from "@/app/settings/profile/_components/profile-form";

const actionMocks = vi.hoisted(() => ({
  updateProfileAction: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/app/actions/profile", () => actionMocks);

vi.mock("sonner", () => ({
  toast: toastMocks,
}));

describe("ProfileForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updateProfileAction.mockResolvedValue({ success: true });
  });

  it("validates that display name is required", async () => {
    render(<ProfileForm initialName="" />);

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Name is required")).toBeInTheDocument();
    expect(actionMocks.updateProfileAction).not.toHaveBeenCalled();
  });

  it("submits profile updates and shows success toast", async () => {
    render(<ProfileForm initialName="Existing name" />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Updated name" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(actionMocks.updateProfileAction).toHaveBeenCalledWith({ name: "Updated name" });
    });

    expect(toastMocks.success).toHaveBeenCalledWith("Display name updated");
  });

  it("shows an error toast when profile update fails", async () => {
    actionMocks.updateProfileAction.mockResolvedValueOnce({ error: "Unable to update profile" });
    render(<ProfileForm initialName="Existing name" />);

    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Another name" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(toastMocks.error).toHaveBeenCalledWith("Unable to update profile");
    });
  });
});
