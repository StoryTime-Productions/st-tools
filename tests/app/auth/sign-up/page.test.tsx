import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignUpPage from "@/app/auth/sign-up/page";

const actionMocks = vi.hoisted(() => ({
  signUpAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
}));

vi.mock("@/app/actions/auth", () => actionMocks);

describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    actionMocks.signUpAction.mockResolvedValue({});
  });

  it("submits sign-up form and shows server errors", async () => {
    actionMocks.signUpAction.mockResolvedValueOnce({ error: "Email already in use" });
    render(<SignUpPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    await waitFor(() => {
      expect(actionMocks.signUpAction).toHaveBeenCalledWith({
        email: "owner@example.com",
        password: "password123",
        confirmPassword: "password123",
      });
    });

    expect(screen.getByText("Email already in use")).toBeInTheDocument();
  });

  it("switches to confirmation state when email verification is required", async () => {
    actionMocks.signUpAction.mockResolvedValueOnce({ confirmEmail: true });
    render(<SignUpPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(await screen.findByText("Check your email")).toBeInTheDocument();
  });

  it("validates password confirmation before submit", async () => {
    render(<SignUpPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "member@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "different123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign up$/i }));

    expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
    expect(actionMocks.signUpAction).not.toHaveBeenCalled();
  });
});
