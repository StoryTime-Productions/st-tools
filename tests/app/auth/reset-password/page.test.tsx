import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ResetPasswordPage from "@/app/auth/reset-password/page";
import { ResetPasswordForm } from "@/app/auth/reset-password/reset-password-form";

const createClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  })
);
const actionMocks = vi.hoisted(() => ({
  updatePasswordAction: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app/actions/auth", () => actionMocks);

function mockSession(user: { id: string } | null, method = "otp") {
  createClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { amr: [{ method, timestamp: Date.now() / 1000 }] } },
      }),
    },
  });
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the form when the reset link signed the user in", async () => {
    mockSession({ id: "u-1" });

    render(await ResetPasswordPage());

    expect(screen.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  });

  it("sends an ordinary signed-in session to the dashboard instead of the form", async () => {
    mockSession({ id: "u-1" }, "password");

    await expect(ResetPasswordPage()).rejects.toThrow("NEXT_REDIRECT /dashboard");
    expect(redirectMock).toHaveBeenCalledWith("/dashboard");
  });

  it("explains an expired link and offers a new one when there is no session", async () => {
    mockSession(null);

    render(await ResetPasswordPage());

    expect(screen.getByRole("heading", { level: 1, name: "This link has expired" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Request a new link" })).toHaveAttribute(
      "href",
      "/auth/forgot-password"
    );
  });
});

describe("ResetPasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.updatePasswordAction.mockResolvedValue({});
  });

  function fill(password: string, confirm: string) {
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: password } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
  }

  it("states the rule and sets new-password autocomplete hints", () => {
    render(<ResetPasswordForm />);

    expect(screen.getByText("Use at least 8 characters.")).toBeVisible();
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );
  });

  it("validates before asking the server", async () => {
    render(<ResetPasswordForm />);

    fill("short", "short");
    expect(await screen.findByText("Password must be at least 8 characters")).toBeVisible();

    fill("longenough1", "different12");
    expect(await screen.findByText("Passwords do not match")).toBeVisible();
    expect(actionMocks.updatePasswordAction).not.toHaveBeenCalled();
  });

  it("saves a valid new password", async () => {
    render(<ResetPasswordForm />);

    fill("longenough1", "longenough1");

    await waitFor(() => {
      expect(actionMocks.updatePasswordAction).toHaveBeenCalledWith({
        password: "longenough1",
        confirmPassword: "longenough1",
      });
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a server error as an alert", async () => {
    actionMocks.updatePasswordAction.mockResolvedValueOnce({
      error: "Choose a different password from your current one.",
    });
    render(<ResetPasswordForm />);

    fill("longenough1", "longenough1");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Choose a different password from your current one."
    );
  });
});
