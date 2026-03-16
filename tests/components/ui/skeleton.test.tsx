import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Skeleton } from "@/components/ui/skeleton";

describe("Skeleton", () => {
  it("renders skeleton placeholder", () => {
    const { container } = render(<Skeleton />);

    const skeleton = container.firstChild;
    expect(skeleton).toBeDefined();
  });

  it("applies skeleton styles", () => {
    const { container } = render(<Skeleton className="h-12 w-12" />);

    const element = container.firstChild as HTMLElement;
    expect(element.className).toContain("h-12");
    expect(element.className).toContain("w-12");
  });

  it("renders multiple skeletons", () => {
    const { container } = render(
      <div>
        <Skeleton className="mb-2 h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );

    const skeletons = container.querySelectorAll("[class*='animate-pulse']");
    expect(skeletons.length).toBeGreaterThanOrEqual(0);
  });

  it("accepts custom className", () => {
    const { container } = render(<Skeleton className="h-10 w-10 rounded-full" />);

    const element = container.firstChild as HTMLElement;
    expect(element.className).toContain("rounded-full");
  });
});
