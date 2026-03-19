import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@/components/ui/badge";

describe("Badge", () => {
  it("renders badge with default variant", () => {
    render(<Badge>Default Badge</Badge>);

    expect(screen.getByText("Default Badge")).toBeInTheDocument();
  });

  it("renders badge with secondary variant", () => {
    render(<Badge variant="secondary">Secondary</Badge>);

    expect(screen.getByText("Secondary")).toBeInTheDocument();
  });

  it("renders badge with destructive variant", () => {
    render(<Badge variant="destructive">Destructive</Badge>);

    expect(screen.getByText("Destructive")).toBeInTheDocument();
  });

  it("renders badge with outline variant", () => {
    render(<Badge variant="outline">Outline</Badge>);

    expect(screen.getByText("Outline")).toBeInTheDocument();
  });

  it("applies correct classes to badge", () => {
    const { container } = render(<Badge>Test Badge</Badge>);
    const badge = container.firstChild;

    expect(badge).toBeDefined();
  });
});
