import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("Popover", () => {
  it("renders open popover with title and description", () => {
    const { container } = render(
      <Popover open>
        <PopoverTrigger>Open popover</PopoverTrigger>
        <PopoverContent align="end" sideOffset={10}>
          <PopoverHeader>
            <PopoverTitle>Card details</PopoverTitle>
            <PopoverDescription>Manage assignee and due date.</PopoverDescription>
          </PopoverHeader>
        </PopoverContent>
      </Popover>
    );

    const content = container.ownerDocument.querySelector("[data-slot='popover-content']");

    expect(content).toBeInTheDocument();
    expect(screen.getByText("Card details")).toBeInTheDocument();
    expect(screen.getByText("Manage assignee and due date.")).toBeInTheDocument();
  });

  it("renders anchor and trigger slots", () => {
    const { container } = render(
      <Popover open>
        <PopoverAnchor data-testid="anchor" />
        <PopoverTrigger>Trigger</PopoverTrigger>
        <PopoverContent>Body</PopoverContent>
      </Popover>
    );

    const anchor = container.ownerDocument.querySelector("[data-slot='popover-anchor']");
    const trigger = container.ownerDocument.querySelector("[data-slot='popover-trigger']");

    expect(anchor).toBeInTheDocument();
    expect(trigger).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
  });
});
