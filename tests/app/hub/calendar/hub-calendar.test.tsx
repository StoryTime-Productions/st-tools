import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HubCalendar } from "@/app/hub/calendar/_components/hub-calendar";
import type { CalendarHangout } from "@/lib/hangouts";
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
    render(<HubCalendar cards={CARDS} hangouts={[]} today="2026-09-27" />);

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
    render(<HubCalendar cards={CARDS} hangouts={[]} today="2026-09-27" />);
    fireEvent.click(screen.getByRole("button", { name: "Channel art" }));
    const popover = screen.getByRole("dialog", { name: "Channel art" });
    expect(popover).toHaveTextContent("Unassigned");
    expect(popover).toHaveTextContent("Finished");
  });

  it("switches views, steps through dates and filters by project", () => {
    render(<HubCalendar cards={CARDS} hangouts={[]} today="2026-09-27" />);

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

  it("shows locked hangouts on their day and collecting ones faded on each candidate date", () => {
    const hangouts: CalendarHangout[] = [
      {
        id: "h1",
        title: "Board games",
        status: "SCHEDULED",
        startSlot: "2026-09-26T19:30",
        days: ["2026-09-26"],
        goingCount: 3,
      },
      {
        id: "h2",
        title: "Karaoke",
        status: "COLLECTING",
        startSlot: null,
        days: ["2026-09-24", "2026-09-25"],
        goingCount: 0,
      },
    ];
    render(<HubCalendar cards={CARDS} hangouts={hangouts} today="2026-09-27" />);

    expect(
      within(screen.getByRole("list", { name: "Projects" })).getByText("Hangouts")
    ).toBeInTheDocument();
    const locked = within(screen.getByLabelText("September 26")).getByRole("button", {
      name: "7:30 PM Board games",
    });
    expect(locked).toHaveClass("bg-fuchsia-100");
    expect(screen.getAllByRole("button", { name: "Karaoke" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Karaoke" })[0]).toHaveClass("border-dashed");

    fireEvent.click(locked);
    const popover = screen.getByRole("dialog", { name: "Board games" });
    expect(popover).toHaveTextContent("Scheduled");
    expect(popover).toHaveTextContent("Sat, September 26, 7:30 PM EST · 3 going");
    expect(within(popover).getByRole("link", { name: "Open hangout" })).toHaveAttribute(
      "href",
      "/hub/hangouts/h1"
    );
    fireEvent.keyDown(popover, { key: "Escape" });

    fireEvent.click(screen.getAllByRole("button", { name: "Karaoke" })[0]);
    expect(screen.getByRole("dialog", { name: "Karaoke" })).toHaveTextContent(
      "One of 2 candidate dates"
    );
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Karaoke" }), { key: "Escape" });

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "hangouts" } });
    expect(screen.queryByText("Record trailer")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "7:30 PM Board games" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p2" } });
    expect(screen.queryByText("Board games", { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText("Record trailer")).toBeInTheDocument();
  });
});
