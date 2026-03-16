import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("Tooltip", () => {
  it("renders provider with default delay", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Open tooltip</TooltipTrigger>
          <TooltipContent>Tooltip body</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    expect(screen.getAllByText("Tooltip body").length).toBeGreaterThan(0);
  });

  it("supports custom delay and side offset", () => {
    const { container } = render(
      <TooltipProvider delayDuration={250}>
        <Tooltip open>
          <TooltipTrigger>Trigger</TooltipTrigger>
          <TooltipContent sideOffset={8}>Details</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const content = container.ownerDocument.querySelector(
      "[data-slot='tooltip-content']"
    ) as HTMLElement;

    expect(content).toBeInTheDocument();
    expect(screen.getAllByText("Details").length).toBeGreaterThan(0);
  });

  it("renders trigger and arrow", () => {
    const { container } = render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Hover me</TooltipTrigger>
          <TooltipContent>Hint</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const trigger = screen.getByText("Hover me");
    const arrow = container.ownerDocument.querySelector("svg");

    expect(trigger).toBeInTheDocument();
    expect(arrow).toBeInTheDocument();
  });
});
