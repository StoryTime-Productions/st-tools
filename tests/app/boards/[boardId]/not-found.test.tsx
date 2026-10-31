import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import BoardNotFound from "@/app/boards/[boardId]/not-found";

describe("BoardNotFound", () => {
  it("explains the dead end and links back to the boards list", () => {
    render(<BoardNotFound />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "This board doesn't exist or you don't have access"
    );
    expect(screen.getByRole("link", { name: "Back to boards" })).toHaveAttribute("href", "/boards");
  });
});
