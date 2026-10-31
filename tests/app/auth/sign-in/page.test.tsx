import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignInPage from "@/app/auth/sign-in/page";

const navigationState = vi.hoisted(() => ({
  error: null as string | null,
}));

const actionMocks = vi.hoisted(() => ({
  signInAction: vi.fn(),
  signInWithGoogleAction: vi.fn(),
  signInWithDiscordAction: vi.fn(),
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
    navigationState.error = "confirm";
    render(<SignInPage />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't confirm your account. Request a new link and try again."
    );
  });

  it("ignores unknown or crafted error codes in the URL", () => {
    navigationState.error = "Your account is locked, call 555-0100";
    render(<SignInPage />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/555-0100/)).not.toBeInTheDocument();
  });

  it("links to the forgot password page", () => {
    render(<SignInPage />);

    expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute(
      "href",
      "/auth/forgot-password"
    );
  });

  it("has one level 1 heading and autocomplete hints", () => {
    render(<SignInPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");
  });

  it("submits credentials and shows server-side sign-in errors", async () => {
    actionMocks.signInAction.mockResolvedValueOnce({ error: "Wrong email or password." });
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

    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password.");
  });

  it("starts discord sign-in from the discord button", async () => {
    render(<SignInPage />);

    fireEvent.click(screen.getByRole("button", { name: /continue with discord/i }));

    await waitFor(() => {
      expect(actionMocks.signInWithDiscordAction).toHaveBeenCalledTimes(1);
    });
  });

  it("validates form fields before submitting", async () => {
    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "valid@example.com" },
    });
    const submitButton = screen.getByRole("button", { name: /^sign in$/i });
    const signInForm = submitButton.closest("form");

    if (!signInForm) {
      throw new Error("Expected sign-in form to exist");
    }

    fireEvent.submit(signInForm);

    expect(await screen.findByText("Enter your password")).toBeInTheDocument();
    expect(actionMocks.signInAction).not.toHaveBeenCalled();
  });
});
