import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "@/components/ui/separator";

describe("Separator", () => {
  it("renders horizontal separator by default", () => {
    const { container } = render(<Separator />);

    const separator = container.firstChild;
    expect(separator).toBeDefined();
  });

  it("renders vertical separator when orientation is set", () => {
    const { container } = render(<Separator orientation="vertical" />);

    const separator = container.firstChild;
    expect(separator).toBeDefined();
  });

  it("applies custom className", () => {
    const { container } = render(<Separator className="my-custom-class" />);

    const separator = container.firstChild as HTMLElement;
    expect(separator.className).toContain("my-custom-class");
  });

  it("renders as div element", () => {
    const { container } = render(<Separator />);

    const element = container.querySelector("div");
    expect(element).toBeDefined();
  });
});
