import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import AuthLayout from "@/app/auth/layout";

vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme toggle</button>,
}));

describe("AuthLayout", () => {
  it("renders theme toggle and children", () => {
    render(
      <AuthLayout>
        <p>Auth content</p>
      </AuthLayout>
    );

    expect(screen.getByRole("button", { name: "Theme toggle" })).toBeInTheDocument();
    expect(screen.getByText("Auth content")).toBeInTheDocument();
  });
});
