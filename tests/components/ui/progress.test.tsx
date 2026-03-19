import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Progress } from "@/components/ui/progress";

describe("Progress", () => {
  it("renders root and indicator with default value", () => {
    const { container } = render(<Progress />);

    const root = container.querySelector("[data-slot='progress']");
    const indicator = container.querySelector("[data-slot='progress-indicator']") as HTMLElement;

    expect(root).toBeInTheDocument();
    expect(indicator).toBeInTheDocument();
    expect(indicator.style.transform).toBe("translateX(-100%)");
  });

  it("applies translate transform from value", () => {
    const { container } = render(<Progress value={35} />);

    const indicator = container.querySelector("[data-slot='progress-indicator']") as HTMLElement;
    expect(indicator.style.transform).toBe("translateX(-65%)");
  });

  it("merges custom className on root", () => {
    const { container } = render(<Progress className="custom-progress h-3" value={50} />);

    const root = container.querySelector("[data-slot='progress']") as HTMLElement;
    expect(root.className).toContain("custom-progress");
    expect(root.className).toContain("h-3");
  });
});
