import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { SessionStatsCard } from "@/app/timer/_components/session-stats-card";

type Stats = React.ComponentProps<typeof SessionStatsCard>["stats"];

const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function makeStats(counts: number[], overrides?: Partial<Stats>): Stats {
  return {
    todayCount: counts[6],
    weekCount: counts.reduce((sum, count) => sum + count, 0),
    totalCount: 20,
    last7Days: counts.map((count, index) => ({
      dateKey: `2026-03-${15 + index}`,
      label: labels[index],
      count,
    })),
    ...overrides,
  };
}

describe("SessionStatsCard", () => {
  it("shows today, week and all-time totals together", () => {
    render(<SessionStatsCard stats={makeStats([0, 1, 2, 1, 1, 0, 3])} />);

    expect(screen.getByText("Today").nextElementSibling).toHaveTextContent("3");
    expect(screen.getByText("This week").nextElementSibling).toHaveTextContent("8");
    expect(screen.getByText("All time").nextElementSibling).toHaveTextContent("20");
  });

  it("exposes every day as a table row and hover title", () => {
    render(<SessionStatsCard stats={makeStats([0, 1, 2, 1, 1, 0, 3])} />);

    const table = screen.getByRole("table", { name: "Sessions per day" });
    expect(within(table).getAllByRole("row")).toHaveLength(8);
    expect(within(table).getByRole("row", { name: "Tue 2" })).toBeInTheDocument();
    expect(screen.getByTitle("Sat: 3 sessions")).toBeInTheDocument();
    expect(screen.getByTitle("Mon: 1 session")).toBeInTheDocument();
  });

  it("labels only today's bar with its count", () => {
    render(<SessionStatsCard stats={makeStats([0, 1, 2, 1, 1, 0, 3])} />);

    expect(screen.getByTitle("Sat: 3 sessions")).toHaveTextContent("3");
    expect(screen.getByTitle("Tue: 2 sessions")).not.toHaveTextContent("2");
  });

  it("shows an empty state instead of a chart when there are no sessions", () => {
    render(<SessionStatsCard stats={makeStats([0, 0, 0, 0, 0, 0, 0], { totalCount: 0 })} />);

    expect(screen.getByText(/No sessions yet/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
