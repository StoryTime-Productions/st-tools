import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggle } from "@/components/theme-toggle";

const themeMocks = vi.hoisted(() => ({
  resolvedTheme: "light" as "light" | "dark",
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => themeMocks,
}));

describe("ThemeToggle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    themeMocks.resolvedTheme = "light";
  });

  it("switches from light to dark", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(themeMocks.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches from dark to light", () => {
    themeMocks.resolvedTheme = "dark";
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(themeMocks.setTheme).toHaveBeenCalledWith("light");
  });
});
