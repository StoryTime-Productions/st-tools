import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("with View Transitions support", () => {
    const originalMatchMedia = window.matchMedia;
    const startViewTransition = vi.fn((update: () => void) => update());

    beforeEach(() => {
      Object.defineProperty(document, "startViewTransition", {
        value: startViewTransition,
        configurable: true,
      });
    });

    afterEach(() => {
      Reflect.deleteProperty(document, "startViewTransition");
      window.matchMedia = originalMatchMedia;
    });

    function setReducedMotion(reduce: boolean) {
      window.matchMedia = vi.fn(
        () => ({ matches: reduce }) as MediaQueryList
      ) as unknown as typeof window.matchMedia;
    }

    it("wraps the theme change in a view transition", () => {
      setReducedMotion(false);
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

      expect(startViewTransition).toHaveBeenCalledTimes(1);
      expect(themeMocks.setTheme).toHaveBeenCalledWith("dark");
    });

    it("switches instantly when the user prefers reduced motion", () => {
      setReducedMotion(true);
      render(<ThemeToggle />);

      fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

      expect(startViewTransition).not.toHaveBeenCalled();
      expect(themeMocks.setTheme).toHaveBeenCalledWith("dark");
    });
  });
});
