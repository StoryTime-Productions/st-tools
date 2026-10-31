import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SegmentedToggle } from "@/components/ui/segmented-toggle";

const OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
] as const;

describe("SegmentedToggle", () => {
  it("marks the choice with a check as well as aria-pressed and reports changes", () => {
    const onChange = vi.fn();
    render(<SegmentedToggle label="Letters" options={OPTIONS} value="a" onChange={onChange} />);

    const group = screen.getByRole("group", { name: "Letters" });
    const alpha = within(group).getByRole("button", { name: "Alpha" });
    const beta = within(group).getByRole("button", { name: "Beta" });
    expect(alpha).toHaveAttribute("aria-pressed", "true");
    expect(alpha.querySelector("svg")).not.toBeNull();
    expect(beta).toHaveAttribute("aria-pressed", "false");
    expect(beta.querySelector("svg")).toBeNull();

    fireEvent.click(beta);
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
