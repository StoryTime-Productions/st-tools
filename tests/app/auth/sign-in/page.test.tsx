import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignInPage from "@/app/auth/sign-in/page";

const navigationState = vi.hoisted(() => ({
  error: null as string | null,
}));

const actionMocks = vi.hoisted(() => ({
  signInAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: (key: string) => (key === "error" ? navigationState.error : null),
  }),
}));

vi.mock("next/image", () => ({
  default: (props: {
    alt: string;
    src: string;
    width: number;
    height: number;
    className?: string;
  }) => <div role="img" aria-label={props.alt} data-src={props.src} className={props.className} />,
}));

vi.mock("@/app/actions/auth", () => actionMocks);

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigationState.error = null;
    actionMocks.signInAction.mockResolvedValue({});
  });

  it("shows initial server error from query params", () => {
    navigationState.error = "Session expired";
    render(<SignInPage />);

    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });

  it("submits credentials and shows server-side sign-in errors", async () => {
    actionMocks.signInAction.mockResolvedValueOnce({ error: "Invalid login credentials" });
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));

    await waitFor(() => {
      expect(actionMocks.signInAction).toHaveBeenCalledWith({
        email: "user@example.com",
        password: "password123",
      });
    });

    expect(screen.getByText("Invalid login credentials")).toBeInTheDocument();
  });

  it("validates form fields before submitting", async () => {
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "valid@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "short" },
    });
    const submitButton = screen.getByRole("button", { name: /^sign in$/i });
    const signInForm = submitButton.closest("form");

    if (!signInForm) {
      throw new Error("Expected sign-in form to exist");
    }

    fireEvent.submit(signInForm);

    expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
    expect(actionMocks.signInAction).not.toHaveBeenCalled();
  });
});
