import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Link from "next/link";
import { MobileNav } from "@/components/layout/mobile-nav";

const pathname = vi.hoisted(() => ({ current: "/timer" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
}));

function setup() {
  return render(
    <MobileNav>
      <Link href="/boards">Boards</Link>
      <p>Static caption</p>
    </MobileNav>
  );
}

describe("MobileNav", () => {
  it("keeps the menu closed until the button is pressed", () => {
    setup();

    expect(screen.queryByRole("link", { name: "Boards" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Boards" })).toBeInTheDocument();
  });

  it("closes when a link is chosen but not when other content is clicked", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    fireEvent.click(screen.getByText("Static caption"));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "Boards" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes with Escape", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Menu" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when the route changes while open", () => {
    const { rerender } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();

    pathname.current = "/boards";
    rerender(
      <MobileNav>
        <Link href="/boards">Boards</Link>
      </MobileNav>
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    pathname.current = "/timer";
  });
});
