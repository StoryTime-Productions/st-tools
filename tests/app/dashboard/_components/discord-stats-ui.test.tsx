import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { AutoRefresh } from "@/app/dashboard/_components/auto-refresh";
import { DiscordLeaderboards } from "@/app/dashboard/_components/discord-leaderboards";
import { RightNow } from "@/app/dashboard/_components/right-now";
import { formatMinutes, type DiscordStats } from "@/lib/discord-stats-format";

const routerMocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

function stats(range: DiscordStats["range"], overrides: Partial<DiscordStats> = {}): DiscordStats {
  return {
    range,
    title: { week: "This week", month: "This month", year: "This year" }[range],
    messages: [
      { discordId: "1", name: "Kiara", total: 142, avatarUrl: null },
      { discordId: "2", name: "Denmar With A Very Long Display Name", total: 71, avatarUrl: "x" },
    ],
    voice: [{ discordId: "2", name: "Denmar", total: 580, avatarUrl: null }],
    voiceTrackedSince: "2026-10-30",
    ...overrides,
  };
}

const ALL = { week: stats("week"), month: stats("month"), year: stats("year") };

describe("formatMinutes", () => {
  it("formats minutes as hours and minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(60)).toBe("1h 0m");
    expect(formatMinutes(580)).toBe("9h 40m");
  });
});

describe("DiscordLeaderboards", () => {
  it("ranks people with a value and a unit, and the heading follows the range", () => {
    render(<DiscordLeaderboards stats={ALL} />);

    expect(screen.getByRole("heading", { level: 2, name: "This week on Discord" })).toBeVisible();
    const senders = screen
      .getByRole("heading", { name: "Top senders" })
      .closest("div")!.parentElement!;
    const rows = within(senders).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("1");
    expect(rows[0]).toHaveTextContent("Kiara");
    expect(rows[0]).toHaveTextContent("142 msgs");
    expect(screen.getByText("9h 40m")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Year" }));
    expect(screen.getByRole("heading", { level: 2, name: "This year on Discord" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Year" })).toHaveAttribute("aria-pressed", "true");
  });

  it("says when nothing is counted yet and explains the voice history limit", () => {
    const empty = { messages: [], voice: [], voiceTrackedSince: null };
    render(
      <DiscordLeaderboards
        stats={{
          week: stats("week", empty),
          month: stats("month", empty),
          year: stats("year", empty),
        }}
      />
    );

    expect(screen.getByText("No messages counted this week yet.")).toBeInTheDocument();
    expect(screen.getByText("No voice time counted this week yet.")).toBeInTheDocument();
    expect(
      screen.getByText("Voice time starts counting when the bot is switched on.")
    ).toBeInTheDocument();
  });

  it("notes the date voice tracking began", () => {
    render(<DiscordLeaderboards stats={ALL} />);
    expect(
      screen.getByText("Voice time counted since 2026-10-30. Earlier time is not available.")
    ).toBeInTheDocument();
  });
});

describe("RightNow", () => {
  const joinedAt = new Date("2026-10-30T20:00:00Z");

  it("lists who is on a call with the channel and start time, and the streak", () => {
    render(
      <RightNow
        loaded
        voice={[
          { discordId: "1", name: "Kiara", channelName: "D&D", joinedAt, avatarUrl: null },
          { discordId: "2", name: "Denmar", channelName: "D&D", joinedAt, avatarUrl: "x" },
        ]}
        wordle={{ streak: 80, postedOn: "2026-10-30" }}
      />
    );

    expect(screen.getByRole("heading", { name: /On a call/ })).toHaveTextContent("· 2");
    expect(screen.getAllByText(/D&D · since 4:00 PM/)).toHaveLength(2);
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("Group streak as of 2026-10-30.")).toBeInTheDocument();
  });

  it("covers the empty cases", () => {
    render(<RightNow loaded voice={[]} wordle={null} />);

    expect(screen.getByText("Nobody is on a call right now.")).toBeInTheDocument();
    expect(screen.getByText("The streak shows up after the next Wordle post.")).toBeInTheDocument();
  });

  it("uses the singular for a one day streak", () => {
    render(<RightNow loaded voice={[]} wordle={{ streak: 1, postedOn: "2026-10-30" }} />);
    expect(screen.getByText("day")).toBeInTheDocument();
  });

  it("shows an alert instead of the cards when the stats could not load", () => {
    render(<RightNow loaded={false} voice={[]} wordle={null} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the Discord stats");
    expect(screen.queryByText("Nobody is on a call right now.")).not.toBeInTheDocument();
  });
});

describe("AutoRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    routerMocks.refresh.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("refreshes every minute while the tab is visible and stops on unmount", () => {
    const { unmount } = render(<AutoRefresh />);

    act(() => vi.advanceTimersByTime(60_000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);

    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => vi.advanceTimersByTime(60_000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);

    unmount();
    act(() => vi.advanceTimersByTime(120_000));
    expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
  });
});
