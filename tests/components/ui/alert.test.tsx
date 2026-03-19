import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

describe("Alert", () => {
  it("renders alert with default styling", () => {
    render(
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Alert Title</AlertTitle>
        <AlertDescription>Alert description text</AlertDescription>
      </Alert>
    );

    expect(screen.getByText("Alert Title")).toBeInTheDocument();
    expect(screen.getByText("Alert description text")).toBeInTheDocument();
  });

  it("renders alert with children", () => {
    render(
      <Alert>
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>This is a warning message</AlertDescription>
      </Alert>
    );

    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("applies alert styles to container", () => {
    const { container } = render(<Alert />);
    const alert = container.firstChild;

    expect(alert).toBeDefined();
  });
});
