import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BucketListError from "@/app/bucket-list/error";
import BucketListLoading from "@/app/bucket-list/loading";

describe("bucket list loading and error states", () => {
  it("announces loading", () => {
    render(<BucketListLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the bucket list");
  });

  it("offers a retry on error and logs the cause", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    const error = new Error("boom");
    render(<BucketListError error={error} reset={reset} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the bucket list");
    expect(log).toHaveBeenCalledWith(error);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalled();
    log.mockRestore();
  });
});
