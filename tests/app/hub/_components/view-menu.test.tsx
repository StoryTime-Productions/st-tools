import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ViewMenu } from "@/app/hub/_components/view-menu";

const SHOW = [
  { value: "mixed", label: "Mixed" },
  { value: "separate", label: "Separate" },
];
const GROUP = [
  { value: "list", label: "List" },
  { value: "quarter", label: "By quarter" },
];

function Harness() {
  const [show, setShow] = useState("mixed");
  const [group, setGroup] = useState("list");

  return (
    <ViewMenu
      groups={[
        { label: "Show", options: SHOW, value: show, onChange: setShow },
        { label: "Group by", options: GROUP, value: group, onChange: setGroup },
      ]}
    />
  );
}

describe("ViewMenu", () => {
  it("summarises the current choices on the button", () => {
    render(<Harness />);

    expect(screen.getByRole("button", { name: "View: Mixed · List" })).toBeInTheDocument();
  });

  it("offers each setting as a radio group and applies a choice at once", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /^View:/ }));

    const show = await screen.findByRole("radiogroup", { name: "Show" });
    const group = screen.getByRole("radiogroup", { name: "Group by" });
    expect(within(show).getByRole("radio", { name: "Mixed" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "List" })).toBeChecked();

    fireEvent.click(within(group).getByRole("radio", { name: "By quarter" }));
    fireEvent.click(within(show).getByRole("radio", { name: "Separate" }));

    expect(within(group).getByRole("radio", { name: "By quarter" })).toBeChecked();
    expect(within(show).getByRole("radio", { name: "Separate" })).toBeChecked();
    expect(within(group).getByRole("radio", { name: "List" })).not.toBeChecked();
    // the popover stays open so both settings can be changed, and the label follows
    expect(screen.getByRole("radiogroup", { name: "Show" })).toBeInTheDocument();
  });
});
