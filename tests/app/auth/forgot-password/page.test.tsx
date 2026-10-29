import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/auth/forgot-password/page";

const navigationState = vi.hoisted(() => ({
  error: null as string | null,
}));

const actionMocks = vi.hoisted(() => ({
  requestPasswordResetAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "error" ? navigationState.error : null),
  }),
}));

vi.mock("@/app/actions/auth", () => actionMocks);

function submitEmail(value: string) {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.error = null;
    actionMocks.requestPasswordResetAction.mockResolvedValue({ success: true });
  });

  it("asks for an email under a level 1 heading with an autocomplete hint", () => {
    render(<ForgotPasswordPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByRole("link", { name: "Back to sign in" })).toHaveAttribute(
      "href",
      "/auth/sign-in"
    );
  });

  it("shows the same confirmation whatever the address, with a way back", async () => {
    render(<ForgotPasswordPage />);

    submitEmail("member@example.com");

    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account exists for member@example.com"
    );
    expect(actionMocks.requestPasswordResetAction).toHaveBeenCalledWith({
      email: "member@example.com",
    });
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Use a different email" }));
    expect(screen.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
  });

  it("validates the email before asking the server", async () => {
    render(<ForgotPasswordPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "not an email" } });
    const form = screen.getByRole("button", { name: "Send reset link" }).closest("form");
    if (!form) {
      throw new Error("Expected the reset form to exist");
    }
    fireEvent.submit(form);

    expect(await screen.findByText("Invalid email address")).toBeVisible();
    expect(actionMocks.requestPasswordResetAction).not.toHaveBeenCalled();
  });

  it("shows a rate limit message from the server as an alert", async () => {
    actionMocks.requestPasswordResetAction.mockResolvedValueOnce({
      error: "Too many attempts. Wait a few minutes and try again.",
    });
    render(<ForgotPasswordPage />);

    submitEmail("member@example.com");

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts.");
    });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("explains an expired link from the callback and ignores unknown codes", () => {
    navigationState.error = "expired";
    const { unmount } = render(<ForgotPasswordPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That reset link has expired or was already used. Request a new one."
    );
    unmount();

    navigationState.error = "Call 555-0100 now";
    render(<ForgotPasswordPage />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
