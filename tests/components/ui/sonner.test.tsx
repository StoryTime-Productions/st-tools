import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

type MockToasterProps = {
  theme: string;
  icons: Record<string, unknown>;
  closeButton?: boolean;
  style: Record<string, string>;
  className?: string;
  richColors?: boolean;
};

const useThemeMock = vi.hoisted(() => vi.fn());
const sonnerMock = vi.hoisted(() =>
  vi.fn((props: MockToasterProps) => <div data-testid="mock-sonner" data-theme={props.theme} />)
);

vi.mock("next-themes", () => ({
  useTheme: useThemeMock,
}));

vi.mock("sonner", () => ({
  Toaster: sonnerMock,
}));

import { Toaster } from "@/components/ui/sonner";

describe("Toaster", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses system theme fallback when theme is undefined", () => {
    useThemeMock.mockReturnValueOnce({});

    render(<Toaster richColors />);

    expect(screen.getByTestId("mock-sonner")).toBeInTheDocument();
    expect(sonnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "system",
        className: "toaster group",
        richColors: true,
      }),
      undefined
    );
  });

  it("passes explicit theme and icon set", () => {
    useThemeMock.mockReturnValueOnce({ theme: "dark" });

    render(<Toaster closeButton />);

    const firstCall = sonnerMock.mock.calls[0];
    if (!firstCall) {
      throw new Error("Expected Sonner Toaster mock to be called.");
    }
    const props = firstCall[0];

    expect(props.theme).toBe("dark");
    expect(props.closeButton).toBe(true);
    expect(Object.keys(props.icons).sort()).toEqual([
      "error",
      "info",
      "loading",
      "success",
      "warning",
    ]);
    expect(props.style["--normal-bg"]).toBe("var(--popover)");
  });
});
