import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BoardsError from "@/app/boards/error";
import BoardsLoading from "@/app/boards/loading";

describe("boards loading and error states", () => {
  it("announces loading", () => {
    render(<BoardsLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading boards");
  });

  it("offers a retry on error", () => {
    const reset = vi.fn();
    render(<BoardsError error={new Error("boom")} reset={reset} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load your boards");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
  });
});
