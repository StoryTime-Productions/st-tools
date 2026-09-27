import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HubCalendar } from "@/app/hub/calendar/_components/hub-calendar";
import type { CalendarCard } from "@/lib/hub";

vi.mock("@/components/ui/select", async () => import("../../../helpers/native-select"));

function card(overrides: Partial<CalendarCard>): CalendarCard {
  return {
    id: "c1",
    title: "Record trailer",
    dueDate: "2026-09-29",
    boardId: "b1",
    boardTitle: "Relaunch plan",
    projectId: "p2",
    projectTitle: "Channel relaunch",
    assigneeName: "Alice",
    finished: false,
    ...overrides,
  };
}

const CARDS = [
  card({}),
  card({
    id: "c2",
    title: "Channel art",
    dueDate: "2026-09-24",
    finished: true,
    assigneeName: null,
  }),
  card({
    id: "c3",
    title: "Release notes",
    dueDate: "2026-10-05",
    boardId: "b2",
    projectId: "p1",
    projectTitle: "St-tools",
  }),
];

function heading() {
  return screen.getByRole("heading", { level: 2 }).textContent;
}

describe("HubCalendar", () => {
  it("shows the month with a project legend and card details in a popover", () => {
    render(<HubCalendar cards={CARDS} today="2026-09-27" />);

    expect(heading()).toBe("September 2026");
    expect(screen.getByRole("button", { name: "Month" })).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("list", { name: "Projects" })).getAllByRole("listitem")
    ).toHaveLength(2);
    expect(
      within(screen.getByLabelText("September 29")).getByText("Record trailer")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Channel art" })).toHaveClass("line-through");
    expect(screen.queryByText("Release notes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Record trailer" }));
    const popover = screen.getByRole("dialog", { name: "Record trailer" });
    expect(popover).toHaveTextContent("Channel relaunch · Relaunch plan");
    expect(popover).toHaveTextContent("Due September 29, 2026 · Alice");
    expect(within(popover).getByRole("link", { name: "Open card" })).toHaveAttribute(
      "href",
      "/boards/b1?card=c1"
    );
  });

  it("marks finished cards and unassigned ones in the popover", () => {
    render(<HubCalendar cards={CARDS} today="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Channel art" }));
    const popover = screen.getByRole("dialog", { name: "Channel art" });
    expect(popover).toHaveTextContent("Unassigned");
    expect(popover).toHaveTextContent("Finished");
  });

  it("switches views, steps through dates and filters by project", () => {
    render(<HubCalendar cards={CARDS} today="2026-09-27" />);

    fireEvent.click(screen.getByRole("button", { name: "Week" }));
    expect(heading()).toBe("Sep 27 – Oct 3, 2026");
    expect(screen.getByRole("region", { name: "Tuesday, September 29" })).toHaveTextContent(
      "Record trailer"
    );
    expect(screen.getByRole("region", { name: "Monday, September 28" })).toHaveTextContent(
      "Nothing due"
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(heading()).toBe("Oct 4 – Oct 10, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Day" }));
    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(heading()).toBe("Sunday, September 27, 2026");

    fireEvent.click(screen.getByRole("button", { name: "Agenda" }));
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toContain(
      "Thursday, September 24Channel art"
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p1" } });
    expect(screen.getByText("Nothing due this month.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(heading()).toBe("October 2026");
    expect(screen.getByText("Release notes")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(heading()).toBe("September 2026");
  });
});
