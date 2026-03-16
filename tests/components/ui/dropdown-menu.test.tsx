import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("DropdownMenu", () => {
  it("renders open content with menu items and variants", () => {
    const { container } = render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel inset>Actions</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem inset>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked>Pin item</DropdownMenuCheckboxItem>
          <DropdownMenuRadioGroup value="high">
            <DropdownMenuRadioItem value="high">High</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="low">Low</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuShortcut>Ctrl+K</DropdownMenuShortcut>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    const content = container.ownerDocument.querySelector(
      "[data-slot='dropdown-menu-content']"
    ) as HTMLElement;
    const destructive = screen.getByText("Delete").closest("[data-slot='dropdown-menu-item']");

    expect(content).toBeInTheDocument();
    expect(screen.getByText("Actions")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Pin item")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Ctrl+K")).toBeInTheDocument();
    expect(destructive).toHaveAttribute("data-variant", "destructive");
  });

  it("renders submenu and explicit portal wrappers", () => {
    const { container } = render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger inset>More</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>Nested option</DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
        <DropdownMenuPortal>
          <div>Portal child</div>
        </DropdownMenuPortal>
      </DropdownMenu>
    );

    const subTrigger = container.ownerDocument.querySelector(
      "[data-slot='dropdown-menu-sub-trigger']"
    ) as HTMLElement;

    expect(subTrigger).toHaveAttribute("data-inset", "true");
    expect(screen.getByText("Nested option")).toBeInTheDocument();
    expect(screen.getAllByText("Portal child").length).toBeGreaterThan(0);
  });
});
